package com.pulse.logistics.core.model

/** Mirrors `public.delivery_event` (0001). A milestone never overwrites the status. */
enum class DeliveryEvent(val raw: String, val label: String) {
    PickupAttempted("pickup_attempted", "Pickup attempted"),
    DeliveryAttempted("delivery_attempted", "Delivery attempted"),
    RecipientVerified("recipient_verified", "Recipient verified"),
    PaymentConfirmed("payment_confirmed", "Payment confirmed"),
    ProofOfDeliveryUploaded("proof_of_delivery_uploaded", "Proof uploaded"),
    CustomerDeclined("customer_declined", "Customer declined"),
    WrongAddress("wrong_address", "Wrong address"),
    RoadDiversion("road_diversion", "Road diversion"),
    ;

    companion object {
        fun from(raw: String?): DeliveryEvent? = raw?.let { v -> entries.firstOrNull { it.raw == v } }
    }
}

/** Mirrors `public.driver_status`. */
enum class DriverStatus(val raw: String, val label: String) {
    Available("available", "Available"), Busy("busy", "Busy"),
    Offline("offline", "Offline"), Suspended("suspended", "Suspended"),
    ;

    companion object {
        fun from(raw: String?) = raw?.let { v -> entries.firstOrNull { it.raw == v } }
    }
}

/** Mirrors `public.assignment_status`. */
enum class AssignmentStatus(val raw: String, val label: String) {
    Pending("pending", "Waiting for driver"), Accepted("accepted", "Accepted"),
    Declined("declined", "Declined"), Expired("expired", "Expired"),
    Cancelled("cancelled", "Cancelled"), Superseded("superseded", "Replaced"),
    ;

    companion object {
        fun from(raw: String?) = raw?.let { v -> entries.firstOrNull { it.raw == v } }
    }
}

/** Mirrors `public.payment_status`. */
enum class PaymentStatus(val raw: String, val label: String) {
    Unpaid("unpaid", "Unpaid"), PendingConfirmation("pending_confirmation", "Awaiting confirmation"),
    Paid("paid", "Paid"), PartiallyPaid("partially_paid", "Partly paid"),
    Refunded("refunded", "Refunded"), Failed("failed", "Failed"), Waived("waived", "Waived"),
    ;

    companion object {
        fun from(raw: String?) = raw?.let { v -> entries.firstOrNull { it.raw == v } }
    }
}
