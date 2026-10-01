package com.pulse.logistics.data

import com.pulse.logistics.core.model.AssignmentDto
import com.pulse.logistics.core.model.DriverDto
import com.pulse.logistics.core.model.DriverSummary
import com.pulse.logistics.core.model.DriverTask
import com.pulse.logistics.core.model.HistoryDto
import com.pulse.logistics.core.model.OrderDto
import com.pulse.logistics.core.model.OrderSummary
import com.pulse.logistics.core.model.toSummary
import com.pulse.logistics.core.model.toTask
import com.pulse.logistics.core.network.SupabaseClient

/**
 * Board and driver reads. Columns are named exactly as migration 0005 writes them
 * (`reference`, `pickup_text`, `destination_text`), and an empty list is rendered as
 * empty: RLS says what this user may see, and that is the answer.
 */
class OrdersApi(private val client: SupabaseClient) {

    suspend fun board(businessId: String): List<OrderSummary> =
        client.rows<OrderDto>(
            "orders",
            "select=$ORDER_COLUMNS&business_id=eq.$businessId" +
                "&order=status_changed_at.desc&limit=100",
        ).mapNotNull { it.toSummary() }

    /** The append-only trail Postgres wrote; the app never composes it. */
    suspend fun history(orderId: String): List<HistoryDto> = client.rows(
        "order_status_history",
        "select=id,order_id,from_status,to_status,delivery_event,note,actor_kind,occurred_at" +
            "&order_id=eq.$orderId&order=occurred_at.asc&limit=200",
    )

    suspend fun drivers(businessId: String): List<DriverSummary> =
        client.rows<DriverDto>(
            "drivers",
            "select=id,business_id,full_name,phone_e164,status,vehicle_type,home_base," +
                "average_rating,completed_order_count,is_active" +
                "&business_id=eq.$businessId&is_active=is.true&order=full_name.asc",
        ).mapNotNull { it.toSummary() }

    /**
     * Current assignments for every driver record linked to this account. A driver
     * with no linked `drivers` row gets an empty list and the UI says why, instead of
     * showing someone else's work.
     */
    suspend fun myTasks(userId: String): List<DriverTask> {
        val driverIds = client.rows<DriverRefDto>(
            "drivers",
            "select=id,business_id&profile_user_id=eq.$userId&is_active=is.true",
        ).mapNotNull { it.id }
        if (driverIds.isEmpty()) return emptyList()

        return client.rows<AssignmentDto>(
            "driver_assignments",
            "select=id,business_id,order_id,driver_id,status,is_current,assigned_at,responded_at," +
                "order:orders($ORDER_COLUMNS)&" + SupabaseClient.inFilter("driver_id", driverIds) +
                "&is_current=is.true&order=assigned_at.desc",
        ).mapNotNull { it.toTask() }
    }

    companion object {
        /**
         * One place for the board projection. The customer embed works because
         * `orders.customer_id` is a real FK; unknown or hidden columns are ignored.
         */
        const val ORDER_COLUMNS =
            "id,business_id,customer_id,reference,status,source,service_type,pickup_text," +
                "destination_text,price_amount,currency,payment_status,payment_method," +
                "requires_otp,requested_at,scheduled_at,status_changed_at," +
                "customer:customers(id,display_name,phone_e164)"
    }
}
