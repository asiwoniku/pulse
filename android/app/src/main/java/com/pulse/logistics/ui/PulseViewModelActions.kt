package com.pulse.logistics.ui

import com.pulse.logistics.core.model.BusinessRole
import com.pulse.logistics.core.model.DeliveryEvent
import com.pulse.logistics.core.model.DriverStatus
import com.pulse.logistics.core.model.OrderStatus
import com.pulse.logistics.core.model.historyLines

/**
 * The verbs the role surfaces use. Each one calls the database and reports what came
 * back; there is no optimistic status, because a dispatch board that lies about a
 * stage is worse than one that is slow.
 */

fun PulseViewModel.createBusiness(name: String, city: String?, currency: String?) = guard {
    val created = spaces.createBusiness(name, city, currency)
    _state.update { it.copy(message = created?.name?.let { n -> "Workspace \"$n\" created." }) }
    reloadSpaces()
}

fun PulseViewModel.invite(email: String, role: BusinessRole, name: String?) = guard {
    val invitation = spaces.invite(workspace().id, email, role, name, null)
    _state.update {
        it.copy(
            message = invitation?.code?.let { code ->
                "Invitation for ${invitation.email} as ${invitation.role}. Share code $code out-of-band; " +
                    "expires ${invitation.expires_at ?: "per policy"}."
            } ?: "Invitation recorded.",
        )
    }
}

fun PulseViewModel.acceptInvitation(code: String) = guard {
    val membership = spaces.acceptInvitation(code)
    _state.update {
        it.copy(message = membership?.role?.let { r -> "Joined the workspace as $r." } ?: "Invitation accepted.")
    }
    reloadSpaces()
}

fun PulseViewModel.refreshBoard() = guard { reloadBoard() }

fun PulseViewModel.refreshTasks() = guard { reloadTasks() }

fun PulseViewModel.showTrail(orderId: String) = guard {
    _state.update { it.copy(history = historyLines(board.history(orderId))) }
}

fun PulseViewModel.createOrder(
    customerName: String,
    phone: String,
    pickup: String,
    destination: String,
    price: String?,
) = guard {
    val created = ops.createOrder(workspace().id, customerName, phone, pickup, destination, null, price)
    _state.update { it.copy(message = created?.reference?.let { r -> "Order $r created." }) }
    reloadBoard()
}

fun PulseViewModel.assign(orderId: String, driverId: String) = guard {
    ops.assign(orderId, driverId, null)
    _state.update { it.copy(message = "Assignment sent. The order moves when the driver accepts.") }
    reloadBoard()
}

fun PulseViewModel.cancelAssignment(assignmentId: String, reason: String?) = guard {
    ops.cancelAssignment(assignmentId, reason)
    _state.update { it.copy(message = "Assignment cancelled.") }
    reloadBoard()
}

/** The requested transition only. Migration 0006 decides legality and says why not. */
fun PulseViewModel.moveStatus(orderId: String, to: OrderStatus) = guard {
    ops.moveStatus(orderId, to)
    _state.update { it.copy(message = "Order moved to ${to.label}.") }
    reloadBoard()
}

fun PulseViewModel.respond(assignmentId: String, accept: Boolean, reason: String?) = guard {
    ops.respond(assignmentId, accept, reason)
    _state.update { it.copy(message = if (accept) "Assignment accepted." else "Assignment declined.") }
    reloadTasks()
}

fun PulseViewModel.recordAttempt(orderId: String, event: DeliveryEvent, note: String?) = guard {
    ops.recordAttempt(orderId, event, note)
    _state.update { it.copy(message = "Recorded: ${event.label}.") }
}

fun PulseViewModel.captureProof(orderId: String, deliveredTo: String, photoUrl: String?, otp: String?) = guard {
    ops.captureProof(orderId, deliveredTo, photoUrl, otp)
    _state.update { it.copy(message = "Proof captured; the order is now delivered.") }
    reloadTasks()
}

fun PulseViewModel.setAvailability(status: DriverStatus) = guard {
    ops.setAvailability(status)
    _state.update { it.copy(message = "Availability set to ${status.label}.") }
}
