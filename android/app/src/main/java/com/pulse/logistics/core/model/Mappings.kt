package com.pulse.logistics.core.model

/** The dispatch board row. */
data class OrderSummary(
    val id: String,
    val reference: String,
    val status: OrderStatus?,
    val rawStatus: String?,
    val customerName: String,
    val pickup: String,
    val dropoff: String,
    val price: String?,
    val currency: String?,
    val paymentStatus: PaymentStatus?,
    val requiresOtp: Boolean,
    val scheduledAt: String?,
)

/** One assignment the signed-in driver must act on. */
data class DriverTask(
    val assignmentId: String,
    val orderId: String,
    val reference: String,
    val status: OrderStatus?,
    val rawStatus: String?,
    val assignmentStatus: AssignmentStatus?,
    val dropoff: String,
    val customerPhone: String?,
    val requiresOtp: Boolean,
)

data class WorkspaceSummary(
    val id: String,
    val name: String,
    val currency: String?,
    val role: BusinessRole?,
)

data class DriverSummary(
    val id: String,
    val name: String,
    val phone: String,
    val status: DriverStatus?,
    val vehicle: String?,
    /** Null until a real customer rates a real completed order (0012). */
    val rating: String?,
    val completedOrders: Int,
)

fun OrderDto.toSummary(): OrderSummary? {
    val orderId = id ?: return null
    return OrderSummary(
        id = orderId,
        reference = reference ?: "no reference",
        status = OrderStatus.from(status),
        rawStatus = status,
        // The phone is the one field a real customer row always has, so it is the
        // honest fallback rather than "Unknown".
        customerName = customer?.display_name?.takeIf { it.isNotBlank() }
            ?: customer?.phone_e164 ?: "no customer on row",
        pickup = pickup_text?.takeIf { it.isNotBlank() } ?: "no pickup recorded",
        dropoff = destination_text?.takeIf { it.isNotBlank() } ?: "no destination recorded",
        price = price_amount,
        currency = currency,
        paymentStatus = PaymentStatus.from(payment_status),
        requiresOtp = requires_otp == true,
        scheduledAt = scheduled_at ?: requested_at,
    )
}

fun AssignmentDto.toTask(): DriverTask? {
    val assignmentId = id ?: return null
    val row = order ?: return null
    return DriverTask(
        assignmentId = assignmentId,
        orderId = row.id ?: return null,
        reference = row.reference ?: "no reference",
        status = OrderStatus.from(row.status),
        rawStatus = row.status,
        assignmentStatus = AssignmentStatus.from(status),
        dropoff = row.destination_text?.takeIf { it.isNotBlank() } ?: "no destination recorded",
        customerPhone = row.customer?.phone_e164,
        requiresOtp = row.requires_otp == true,
    )
}

fun BusinessDto.toSummary(membership: MembershipDto?): WorkspaceSummary? {
    val businessId = id ?: return null
    return WorkspaceSummary(
        id = businessId,
        name = name ?: "workspace without a name",
        currency = currency,
        role = BusinessRole.from(membership?.role),
    )
}

fun DriverDto.toSummary(): DriverSummary? {
    val driverId = id ?: return null
    return DriverSummary(
        id = driverId,
        name = full_name ?: "unnamed driver",
        phone = phone_e164 ?: "no phone recorded",
        status = DriverStatus.from(status),
        vehicle = vehicle_type,
        rating = average_rating,
        completedOrders = completed_order_count ?: 0,
    )
}

/** Renders the append-only history as the timeline rows the database already wrote. */
fun historyLines(rows: List<HistoryDto>): List<String> = rows.map { row ->
    val from = OrderStatus.from(row.from_status)?.label ?: row.from_status ?: "–"
    val to = OrderStatus.from(row.to_status)?.label ?: row.to_status ?: "–"
    "${row.occurred_at?.substringBefore('.').orEmpty()}  $from → $to" +
        (row.note?.let { "  ($it)" } ?: "")
}
