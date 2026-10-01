package com.pulse.logistics.core.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Every message the database raises carries a Postgres or HTTP code. Mapping the
 * code beats string-matching an English sentence, but the message is kept for
 * display because the migrations write it for operators.
 */
class SupabaseApiException(
    val code: String,
    override val message: String,
    val httpStatus: Int,
) : IOException(message) {
    val isConflict: Boolean get() = code == "45000" || httpStatus == 409
    val isUnauthenticated: Boolean get() = httpStatus == 401
}

/** Thrown when the app was built without a Supabase project; never falls back to a fake host. */
class MissingProjectConfigException : SupabaseApiException(
    "unconfigured",
    "This build has no Supabase project. Set pulse.supabase.url and pulse.anon.key " +
        "in android/local.properties (see .env.example) and rebuild.",
    0,
)

/**
 * Thin PostgREST / GoTrue client. It has no write-retry logic on purpose:
 * replaying a state change is legal only when the database decides the transition
 * is an idempotent no-op, and that decision belongs to `guard_order_status_change`.
 */
class SupabaseClient(
    private val baseUrl: String,
    private val anonKey: String,
    private val currentToken: suspend () -> String?,
    private val client: OkHttpClient = defaultClient(),
    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    },
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /** Executes an RPC. Returns raw JSON so callers decode into their own domain types. */
    suspend fun rpc(name: String, body: JsonObject = buildJsonObject { }): JsonElement =
        request(
            Request.Builder()
                .url("$baseUrl/rest/v1/rpc/$name")
                .header("Prefer", "return=representation")
                .post(body.toString().toRequestBody(jsonType))
                .build(),
        )

    /** Reads rows. RLS decides which rows exist for this user, so an empty array is a real answer. */
    suspend fun select(table: String, query: String = ""): JsonArray {
        val element = request(
            Request.Builder()
                .url("$baseUrl/rest/v1/$table?${query.ifEmpty { "select=*" }}")
                .header("Accept", "application/json")
                .get()
                .build(),
        )
        return element as? JsonArray
            ?: throw SupabaseApiException("shape", "expected a row set from $table", 200)
    }

    /**
     * Applies a patch to rows matching a PostgREST filter. Used only for the few
     * columns a client may legitimately set; the database re-checks every rule.
     */
    suspend fun patch(table: String, filter: String, body: JsonObject): JsonArray {
        val element = request(
            Request.Builder()
                .url("$baseUrl/rest/v1/$table?$filter")
                .header("Prefer", "return=representation")
                .patch(body.toString().toRequestBody(jsonType))
                .build(),
        )
        return element as? JsonArray ?: JsonArray(emptyList())
    }

    /** GoTrue endpoints (token, signup, refresh). `authenticated` sends the user token instead of the anon key. */
    suspend fun auth(path: String, body: JsonObject, authenticated: Boolean = false): JsonObject =
        request(
            Request.Builder()
                .url("$baseUrl/auth/v1/$path")
                .header(
                    "Authorization",
                    "Bearer ${if (authenticated) currentToken() ?: anonKey else anonKey}",
                )
                .post(body.toString().toRequestBody(jsonType))
                .build(),
        ).jsonObject

    private suspend fun request(builder: Request): JsonElement {
        val token = currentToken()
        val request = builder.newBuilder()
            .header("apikey", anonKey)
            .header("Accept", "application/json")
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw apiError(response.code, text)
            if (text.isBlank()) return JsonObject(emptyMap())
            return json.parseToJsonElement(text)
        }
    }

    private fun apiError(status: Int, body: String): SupabaseApiException {
        var code = status.toString()
        var message = body.take(300).ifBlank { "request failed" }
        runCatching {
            val obj = json.parseToJsonElement(body).jsonObject
            obj["code"]?.jsonPrimitive?.content?.let { code = it }
            (obj["message"] ?: obj["error_description"] ?: obj["error_msg"] ?: obj["error"])
                ?.jsonPrimitive?.content?.let { message = it }
        }
        return SupabaseApiException(code, message, status)
    }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        /** Builds a PostgREST `in=(...)` filter, dropping anything that is not a UUID. */
        fun inFilter(column: String, values: List<String>): String {
            val safe = values.filter { UUID.matches(it) }
            require(safe.isNotEmpty()) { "no valid ids for filter on $column" }
            return "$column=in.(${safe.joinToString(",")})"
        }

        val UUID = Regex(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        )

        fun uuid(value: String): JsonPrimitive = JsonPrimitive(value)
    }
}
