package com.pulse.logistics.data

import com.pulse.logistics.core.model.BusinessDto
import com.pulse.logistics.core.model.BusinessRole
import com.pulse.logistics.core.model.InvitationDto
import com.pulse.logistics.core.model.MembershipDto
import com.pulse.logistics.core.model.WorkspaceSummary
import com.pulse.logistics.core.model.toSummary
import com.pulse.logistics.core.network.SupabaseClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer

/**
 * Workspace reads and writes. The role shown in the UI is always read back from
 * `business_members`; a value the client picked is never trusted.
 */
class WorkspaceApi(private val client: SupabaseClient) {

    /** Every workspace the caller belongs to, with the caller's role inside each. */
    suspend fun workspaces(userId: String): List<WorkspaceSummary> {
        val ids = client.rpc("current_business_ids").let { element ->
            (element as? kotlinx.serialization.json.JsonArray)
                ?.mapNotNull { it.jsonPrimitiveOrNull() }
                .orEmpty()
        }
        if (ids.isEmpty()) return emptyList()

        val businesses = client.rows<BusinessDto>(
            "businesses",
            "select=id,name,city,currency,timezone,country_code&" +
                SupabaseClient.inFilter("id", ids),
        )
        val memberships = client.rows<MembershipDto>(
            "business_members",
            "select=business_id,role,is_active&user_id=eq.$userId&is_active=is.true",
        ).associateBy { it.business_id }

        return businesses.mapNotNull { row -> row.toSummary(memberships[row.id]) }
    }

    suspend fun createBusiness(name: String, city: String?, currency: String?): BusinessDto? =
        client.rpcRow<BusinessDto>(
            "create_business",
            buildJsonObject {
                put("p_name", name.trim())
                if (!city.isNullOrBlank()) put("p_city", city.trim())
                if (!currency.isNullOrBlank()) put("p_currency", currency.trim().uppercase())
            },
        )

    suspend fun invite(
        businessId: String,
        email: String,
        role: BusinessRole,
        name: String?,
        phone: String?,
    ): InvitationDto? = client.rpcRow<InvitationDto>(
        "invite_worker",
        buildJsonObject {
            put("p_business_id", businessId)
            put("p_email", email.trim().lowercase())
            put("p_role", role.raw)
            if (!name.isNullOrBlank()) put("p_display_name", name.trim())
            if (!phone.isNullOrBlank()) put("p_phone_e164", phone.trim())
        },
    )

    suspend fun acceptInvitation(code: String): MembershipDto? =
        client.rpcRow<MembershipDto>("accept_invitation", buildJsonObject { put("p_code", code.trim()) })

    suspend fun members(businessId: String): List<MembershipDto> = client.rows(
        "business_members",
        "select=business_id,user_id,role,is_active&business_id=eq.$businessId&is_active=is.true",
    )

    /** The driver record(s) linked to this account; empty for staff accounts. */
    suspend fun myDriverIds(userId: String): List<String> =
        client.rows<DriverRefDto>(
            "drivers",
            "select=id,business_id&profile_user_id=eq.$userId&is_active=is.true",
        ).mapNotNull { it.id }
}

@Serializable
internal data class DriverRefDto(val id: String? = null, val business_id: String? = null)

/** Reads rows into DTOs, dropping a malformed row instead of guessing at its meaning. */
internal suspend inline fun <reified T : Any> SupabaseClient.rows(
    table: String,
    query: String,
): List<T> = select(table, query).mapNotNull { element ->
    runCatching { json.decodeFromJsonElement(serializer<T>(), element) }.getOrNull()
}

/** Calls an RPC that returns a single row/object. */
internal suspend inline fun <reified T : Any> SupabaseClient.rpcRow(
    name: String,
    body: JsonObject = buildJsonObject { },
): T? = runCatching { json.decodeFromJsonElement(serializer<T>(), rpc(name, body)) }.getOrNull()

internal fun kotlinx.serialization.json.JsonElement.jsonPrimitiveOrNull(): String? =
    (this as? kotlinx.serialization.json.JsonPrimitive)
        ?.let { if (it is kotlinx.serialization.json.JsonNull) null else it.content }
