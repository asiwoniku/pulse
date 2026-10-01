package com.pulse.logistics.data

import com.pulse.logistics.core.network.Session
import com.pulse.logistics.core.network.SupabaseClient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Supabase may answer sign-up with a session (confirmation disabled) or with only a
 * user row (confirmation required). Both are reported honestly: the UI says which
 * happened instead of pretending the user is signed in.
 */
sealed interface AuthOutcome {
    data class SignedIn(val session: Session) : AuthOutcome
    data class AwaitingConfirmation(val email: String) : AuthOutcome
}

class AuthApi(private val client: SupabaseClient) {

    suspend fun signIn(email: String, password: String): AuthOutcome {
        val clean = email.trim().lowercase()
        val body = buildJsonObject {
            put("email", clean)
            put("password", password)
        }
        return outcome(client.auth("token?grant_type=password", body), clean)
    }

    suspend fun signUp(
        email: String,
        password: String,
        fullName: String,
        phone: String?,
    ): AuthOutcome {
        val clean = email.trim().lowercase()
        val body = buildJsonObject {
            put("email", clean)
            put("password", password)
            put("data", kotlinx.serialization.json.buildJsonObject {
                put("full_name", fullName.trim())
                if (!phone.isNullOrBlank()) put("phone", phone.trim())
            })
        }
        return outcome(client.auth("signup", body), clean)
    }

    suspend fun refresh(refreshToken: String): Session {
        val body = buildJsonObject { put("refresh_token", refreshToken) }
        return sessionOf(client.auth("token?grant_type=refresh_token", body))
    }

    /**
     * Profiles are created by the database trigger on signup, so the app never
     * inserts one; it only reads its own row.
     */
    suspend fun myProfile(userId: String): Pair<String?, String?> {
        val rows = client.select("profiles", "select=display_name,phone_e164&id=eq.$userId")
        val first = rows.firstOrNull() ?: return null to null
        val obj = first.jsonObject
        return obj["display_name"]?.jsonPrimitive?.contentSafe() to
            obj["phone_e164"]?.jsonPrimitive?.contentSafe()
    }

    private fun outcome(payload: kotlinx.serialization.json.JsonObject, email: String): AuthOutcome =
        if (payload["access_token"]?.jsonPrimitive?.contentSafe() != null) {
            AuthOutcome.SignedIn(sessionOf(payload))
        } else {
            AuthOutcome.AwaitingConfirmation(email)
        }

    private fun sessionOf(payload: kotlinx.serialization.json.JsonObject): Session {
        val user = payload["user"]?.jsonObject
        val access = payload["access_token"]?.jsonPrimitive?.contentSafe()
        val refresh = payload["refresh_token"]?.jsonPrimitive?.contentSafe()
        require(access != null && refresh != null) { "auth response carried no tokens" }
        return Session(
            userId = user?.get("id")?.jsonPrimitive?.contentSafe()
                ?: error("auth response carried no user id"),
            email = user?.get("email")?.jsonPrimitive?.contentSafe().orEmpty(),
            accessToken = access,
            refreshToken = refresh,
            expiresAtEpochSec = payload["expires_at"]?.jsonPrimitive?.contentSafe()?.toLongOrNull()
                ?: (System.currentTimeMillis() / 1000L + 3600L),
        )
    }
}

/** JsonNull has no content; reading it as null keeps decoding forgiving. */
fun kotlinx.serialization.json.JsonPrimitive.contentSafe(): String? =
    if (this is kotlinx.serialization.json.JsonNull) null else content
