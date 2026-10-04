package com.pulse.logistics.data

import com.pulse.logistics.core.model.OrderDto
import com.pulse.logistics.core.model.ShipmentDto
import com.pulse.logistics.core.model.ShipmentEventDto
import com.pulse.logistics.core.model.ShipmentEventSummary
import com.pulse.logistics.core.model.ShipmentSummary
import com.pulse.logistics.core.model.toSummary
import com.pulse.logistics.core.network.SupabaseClient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Shipment reads and event writes use the signed-in user's PostgREST/RPC token.
 * Postgres RLS and record_shipment_event remain the authority for access and status.
 */
class ShipmentsApi(private val client: SupabaseClient) {

    suspend fun shipments(businessId: String): List<ShipmentSummary> {
        val rows = client.rows<ShipmentDto>(
            "pulse_shipments",
            "select=$SHIPMENT_COLUMNS" +
                "&or=(business_id.eq.$businessId,originator_business_id.eq.$businessId)" +
                "&order=created_at.desc&limit=100",
        )
        val orderIds = rows.mapNotNull { it.order_id }.distinct()
        val orders = if (orderIds.isEmpty()) {
            emptyList()
        } else {
            client.rows<OrderDto>(
                "orders",
                "select=id,reference,status,service_type,pickup_text,destination_text" +
                    "&${SupabaseClient.inFilter("id", orderIds)}",
            )
        }
        val ordersById = orders.mapNotNull { order ->
            order.id?.let { it to order }
        }.toMap()
        return rows.mapNotNull { shipment ->
            shipment.toSummary(shipment.order_id?.let(ordersById::get))
        }
    }

    suspend fun events(shipmentRowId: String): List<ShipmentEventSummary> =
        client.rows<ShipmentEventDto>(
            "pulse_shipment_events",
            "select=$EVENT_COLUMNS&shipment_id=eq.$shipmentRowId" +
                "&order=occurred_at.desc,received_at.desc&limit=501",
        )
            .take(500)
            .asReversed()
            .mapNotNull { it.toSummary() }

    suspend fun recordManualEvent(
        pulseShipmentId: String,
        eventType: String,
        idempotencyKey: String,
        location: String?,
        note: String?,
    ) {
        client.rpc(
            "record_shipment_event",
            buildJsonObject {
                put("p_pulse_shipment_id", pulseShipmentId)
                put("p_event_type", eventType)
                put("p_source_type", "manual")
                put("p_idempotency_key", idempotencyKey)
                if (!location.isNullOrBlank()) put("p_location", location.trim())
                put("p_metadata", buildJsonObject {
                    if (!note.isNullOrBlank()) put("note", note.trim())
                })
            },
        )
    }

    private companion object {
        const val SHIPMENT_COLUMNS =
            "id,pulse_shipment_id,order_id,business_id,originator_business_id," +
                "current_status,last_verified_event_at,last_verified_location,created_at"
        const val EVENT_COLUMNS =
            "event_id,shipment_id,event_type,source_type,occurred_at,received_at," +
                "location,verification_status,metadata"
    }
}
