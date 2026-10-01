package com.pulse.logistics.core.model

/**
 * Mirrors `public.order_status` (0001) and the legal edges of
 * `public.order_transition_edges()` (0006). The mirror exists so the UI can hide an
 * action before asking; it is never the authority. Postgres re-checks every request
 * in `guard_order_status_change`, and when the two disagree the database message is
 * what the operator reads.
 */
enum class OrderStatus(val raw: String, val label: String) {
    Draft("draft", "Draft"),
    Requested("requested", "Requested"),
    UnderReview("under_review", "Under review"),
    Quoted("quoted", "Quoted"),
    AwaitingCustomerApproval("awaiting_customer_approval", "Waiting for customer"),
    Accepted("accepted", "Accepted"),
    Assigned("assigned", "Assigned"),
    DriverAccepted("driver_accepted", "Driver accepted"),
    DriverArrived("driver_arrived", "Driver at pickup"),
    AtPickup("at_pickup", "At pickup"),
    PickupAttemptFailed("pickup_attempt_failed", "Pickup failed"),
    PickedUp("picked_up", "Picked up"),
    InTransit("in_transit", "In transit"),
    ArrivalAttempted("arrival_attempted", "Arrival attempted"),
    Delivered("delivered", "Delivered"),
    Completed("completed", "Completed"),
    Cancelled("cancelled", "Cancelled"),
    Failed("failed", "Failed"),
    ;

    companion object {
        fun from(raw: String?): OrderStatus? = raw?.let { v -> entries.firstOrNull { it.raw == v } }

        /** completed, cancelled, failed are terminal (0006). */
        val terminal = setOf(Completed, Cancelled, Failed)

        private val edges: Map<OrderStatus, Set<OrderStatus>> = mapOf(
            Draft to setOf(Requested, Cancelled),
            Requested to setOf(UnderReview, Assigned, Cancelled),
            UnderReview to setOf(Quoted, Accepted, Assigned, Cancelled),
            Quoted to setOf(AwaitingCustomerApproval, Accepted, Assigned, Cancelled),
            AwaitingCustomerApproval to setOf(Accepted, Cancelled),
            Accepted to setOf(Assigned, Cancelled),
            Assigned to setOf(DriverAccepted, UnderReview, Cancelled),
            DriverAccepted to setOf(DriverArrived, AtPickup, UnderReview, Cancelled),
            DriverArrived to setOf(AtPickup, PickupAttemptFailed, Cancelled),
            AtPickup to setOf(PickedUp, PickupAttemptFailed, Cancelled),
            PickupAttemptFailed to setOf(DriverArrived, AtPickup, Failed, Cancelled),
            PickedUp to setOf(InTransit, Cancelled),
            InTransit to setOf(ArrivalAttempted, Delivered, Failed, Cancelled),
            ArrivalAttempted to setOf(Delivered, InTransit, Failed, Cancelled),
            Delivered to setOf(Completed),
            Completed to emptySet(),
            Cancelled to emptySet(),
            Failed to emptySet(),
        )

        /** Re-applying the current status is an allowed no-op, exactly as in 0006. */
        fun allowed(from: OrderStatus, to: OrderStatus): Boolean =
            from == to || edges[from]?.contains(to) == true

        fun allowedNext(from: OrderStatus): Set<OrderStatus> = edges[from].orEmpty()

        /** Mirrors `public.status_requires_driver()`: execution stages, not dispatch ones. */
        val driverStages = setOf(
            DriverAccepted, DriverArrived, AtPickup, PickupAttemptFailed,
            PickedUp, InTransit, ArrivalAttempted, Delivered,
        )
    }
}

/** Mirrors `public.business_role`; capabilities follow `can_operate()` in 0003. */
enum class BusinessRole(val raw: String, val label: String) {
    Owner("owner", "Owner"),
    Admin("admin", "Admin"),
    Dispatcher("dispatcher", "Dispatcher"),
    Ops("ops", "Operations"),
    Driver("driver", "Driver"),
    ;

    companion object {
        fun from(raw: String?): BusinessRole? = raw?.let { v -> entries.firstOrNull { it.raw == v } }
    }

    val isStaff: Boolean get() = this != Driver

    /** `can_operate` is true for owner, admin, dispatcher, ops. */
    val canOperate: Boolean get() = isStaff
    val canInviteStaff: Boolean get() = this == Owner || this == Admin
}
