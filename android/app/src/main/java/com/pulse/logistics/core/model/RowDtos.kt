package com.pulse.logistics.core.model

import kotlinx.serialization.Serializable

/**
 * Row shapes as PostgREST returns them. Snake-case field names match the columns so
 * no annotations are needed. Everything is nullable with a default: a column added by
 * a later migration must not crash an installed app, and RLS may hide columns.
 * Unknown enum text decodes to null and the UI prints the raw string instead of
 * inventing a meaning.
 */

@Serializable
data class BusinessDto(
    val id: String? = null,
    val name: String? = null,
    val city: String? = null,
    val country_code: String? = null,
    val currency: String? = null,
    val timezone: String? = null,
)

@Serializable
data class MembershipDto(
    val id: String? = null,
    val business_id: String? = null,
    val user_id: String? = null,
    val role: String? = null,
    val is_active: Boolean? = null,
)

@Serializable
data class InvitationDto(
    val id: String? = null,
    val business_id: String? = null,
    val email: String? = null,
    val role: String? = null,
    val code: String? = null,
    val status: String? = null,
    val display_name: String? = null,
    val phone_e164: String? = null,
    val expires_at: String? = null,
)

@Serializable
data class CustomerEmbed(
    val id: String? = null,
    val display_name: String? = null,
    val phone_e164: String? = null,
)

@Serializable
data class LocationEmbed(
    val id: String? = null,
    val label: String? = null,
    val address_text: String? = null,
)

@Serializable
data class OrderDto(
    val id: String? = null,
    val business_id: String? = null,
    val customer_id: String? = null,
    val reference: String? = null,
    val status: String? = null,
    val source: String? = null,
    val service_type: String? = null,
    val description: String? = null,
    val pickup_text: String? = null,
    val destination_text: String? = null,
    val price_amount: String? = null,
    val currency: String? = null,
    val payment_status: String? = null,
    val payment_method: String? = null,
    val requires_otp: Boolean? = null,
    val requested_at: String? = null,
    val scheduled_at: String? = null,
    val status_changed_at: String? = null,
    val customer: CustomerEmbed? = null,
)

@Serializable
data class HistoryDto(
    val id: String? = null,
    val order_id: String? = null,
    val from_status: String? = null,
    val to_status: String? = null,
    val actor_user_id: String? = null,
    val actor_kind: String? = null,
    val note: String? = null,
    val occurred_at: String? = null,
)

@Serializable
data class DriverEmbed(
    val id: String? = null,
    val full_name: String? = null,
    val phone_e164: String? = null,
    val status: String? = null,
    val vehicle_type: String? = null,
)

@Serializable
data class AssignmentDto(
    val id: String? = null,
    val business_id: String? = null,
    val order_id: String? = null,
    val driver_id: String? = null,
    val status: String? = null,
    val is_current: Boolean? = null,
    val assigned_at: String? = null,
    val responded_at: String? = null,
    val order: OrderDto? = null,
    val driver: DriverEmbed? = null,
)

@Serializable
data class DriverDto(
    val id: String? = null,
    val business_id: String? = null,
    val full_name: String? = null,
    val phone_e164: String? = null,
    val status: String? = null,
    val vehicle_type: String? = null,
    val home_base: String? = null,
    val average_rating: String? = null,
    val completed_order_count: Int? = null,
    val is_active: Boolean? = null,
)
