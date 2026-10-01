package com.pulse.logistics.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pulse.logistics.core.designsystem.StatusActive
import com.pulse.logistics.core.designsystem.StatusAssigned
import com.pulse.logistics.core.designsystem.StatusCancelled
import com.pulse.logistics.core.designsystem.StatusCreated
import com.pulse.logistics.core.designsystem.StatusDelivered
import com.pulse.logistics.core.designsystem.StatusProblem
import com.pulse.logistics.core.designsystem.StatusUnconfigured
import com.pulse.logistics.core.model.OrderStatus

/**
 * Status colour is reserved for order state and nothing else, so a dispatcher can
 * read a board by colour alone. An unrecognised status keeps the neutral colour and
 * shows the raw database text: an unknown value is a fact, not a guess.
 */
@Composable
fun StatusChip(status: OrderStatus?, rawStatus: String?, modifier: Modifier = Modifier) {
    val (tint, label) = when (status) {
        null -> StatusCreated to (rawStatus ?: "unknown status")
        OrderStatus.Draft,
        OrderStatus.Requested,
        OrderStatus.UnderReview,
        OrderStatus.Quoted,
        OrderStatus.AwaitingCustomerApproval,
        OrderStatus.Accepted,
        -> StatusCreated to status.label

        OrderStatus.Assigned, OrderStatus.DriverAccepted -> StatusAssigned to status.label

        OrderStatus.AtPickup, OrderStatus.PickedUp, OrderStatus.InTransit,
        OrderStatus.DriverArrived, OrderStatus.ArrivalAttempted,
        -> StatusActive to status.label

        OrderStatus.Delivered, OrderStatus.Completed -> StatusDelivered to status.label

        OrderStatus.PickupAttemptFailed, OrderStatus.Failed -> StatusProblem to status.label
        OrderStatus.Cancelled -> StatusCancelled to status.label
    }

    Surface(color = tint.copy(alpha = 0.14f), shape = MaterialTheme.shapes.small, modifier = modifier) {
        Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.size(8.dp),
            ) {
                androidx.compose.foundation.Canvas(modifier = Modifier.size(8.dp)) {
                    drawCircle(color = tint)
                }
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = tint,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}

/**
 * The one place that speaks about failures and unconfigured integrations. A missing
 * integration is amber and names what is missing; it never renders as success.
 */
@Composable
fun MessageBanner(text: String, kind: MessageKind, modifier: Modifier = Modifier) {
    val tint = when (kind) {
        MessageKind.Error -> StatusProblem
        MessageKind.Unconfigured -> StatusUnconfigured
        MessageKind.Info -> StatusCreated
    }
    Surface(color = tint.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small, modifier = modifier.fillMaxWidth()) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = tint,
            modifier = Modifier.padding(12.dp),
        )
    }
}

enum class MessageKind { Info, Unconfigured, Error }

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
fun BusyRow(busy: Boolean, label: String = "waiting for the database", modifier: Modifier = Modifier) {
    if (!busy) return
    Row(
        modifier = modifier.fillMaxWidth().padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}
