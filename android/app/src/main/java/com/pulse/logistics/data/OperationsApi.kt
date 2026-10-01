package com.pulse.logistics.data

import com.pulse.logistics.core.model.AssignmentDto
import com.pulse.logistics.core.model.DeliveryEvent
import com.pulse.logistics.core.model.DriverStatus
import com.pulse.logistics.core.model.OrderDto
import com.pulse.logistics.core.model.OrderStatus
import com.pulse.logistics.core.network.SupabaseClient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The RPC write paths. Status is only ever sent as a requested transition: the guard
 * in migration 0006 decides legality, and the sentence it raises is what the operator
 * reads. This class holds no retry logic, because replay is only safe when the
 * database says the transition is a no-op.
 */
class OperationsApi(private val client: SupabaseClient) {

    suspend fun createOrder(
        businessId: String,
        customerName: String,
        customerPhone: String,
        pickupText: String,
        destinationText: String,
        description: String?,
        priceAmount: String?,
    ): OrderDto? = client.rpcRow<OrderDto>(
        "create_delivery_order",
        buildJsonObject {
            put("p_business_id", businessId)
            put("p_customer_name", customerName.trim())
            put("p_customer_phone", customerPhone.trim())
            put("p_pickup_text", pickupText.trim())
            put("p_destination_text", destinationText.trim())
            if (!description.isNullOrBlank()) put("p_description", description.trim())
            if (!priceAmount.isNullOrBlank()) put("p_price_amount", priceAmount.trim())
        },
    )

    suspend fun assign(orderId: String, driverId: String, notes: String?) {
        client.rpc(
            "assign_driver",
            buildJsonObject {
                put("p_order_id", orderId)
                put("p_driver_id", driverId)
                put("p_assignment_type", "immediate")
                if (!notes.isNullOrBlank()) put("p_notes", notes.trim())
            },
        )
    }

    suspend fun cancelAssignment(assignmentId: String, reason: String?) {
        client.rpc(
            "cancel_assignment",
            buildJsonObject {
                put("p_assignment_id", assignmentId)
                put("p_reason", reason?.trim().orEmpty().ifBlank { "cancelled from the dispatch board" })
            },
        )
    }

    /** Staff-side status move; refused with 45000/42501 when illegal. */
    suspend fun moveStatus(orderId: String, to: OrderStatus) {
        client.patch(
            "orders",
            "id=eq.$orderId",
            buildJsonObject { put("status", to.raw) },
        )
    }

    suspend fun respond(assignmentId: String, accept: Boolean, reason: String?): AssignmentDto? =
        client.rpcRow<AssignmentDto>(
            "respond_to_assignment",
            buildJsonObject {
                put("p_assignment_id", assignmentId)
                put("p_accept", accept)
                if (!reason.isNullOrBlank()) put("p_reason", reason.trim())
            },
        )

    /** A milestone that does not overwrite the order status (0009, spec section 22). */
    suspend fun recordAttempt(orderId: String, event: DeliveryEvent, note: String?) {
        client.rpc(
            "record_delivery_attempt",
            buildJsonObject {
                put("p_order_id", orderId)
                put("p_event", event.raw)
                if (!note.isNullOrBlank()) put("p_note", note.trim())
            },
        )
    }

    suspend fun captureProof(orderId: String, deliveredTo: String, photoUrl: String?, otp: String?) {
        client.rpc(
            "capture_proof_of_delivery",
            buildJsonObject {
                put("p_order_id", orderId)
                put("p_delivered_to_name", deliveredTo.trim())
                if (!photoUrl.isNullOrBlank()) put("p_photo_url", photoUrl.trim())
                if (!otp.isNullOrBlank()) put("p_otp_code", otp.trim())
            },
        )
    }

    suspend fun setAvailability(status: DriverStatus, driverId: String? = null) {
        client.rpc(
            "set_driver_availability",
            buildJsonObject {
                put("p_status", status.raw)
                if (!driverId.isNullOrBlank()) put("p_driver_id", driverId)
            },
        )
    }
}
