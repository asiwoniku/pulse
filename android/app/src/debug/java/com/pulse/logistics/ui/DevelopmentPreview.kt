package com.pulse.logistics.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private enum class PreviewSection(val title: String) {
    Orders("Orders"),
    Shipments("Shipments"),
    Carriers("Carriers"),
}

private data class PreviewOrder(
    val reference: String,
    val status: String,
    val customer: String,
    val route: String,
    val amount: String,
)

private data class PreviewEvent(
    val event: String,
    val source: String,
    val verification: String,
    val time: String,
    val location: String,
)

private data class PreviewShipment(
    val id: String,
    val status: String,
    val route: String,
    val events: List<PreviewEvent>,
)

private data class PreviewCarrier(
    val name: String,
    val location: String,
    val serviceAreas: String,
    val rating: String,
)

private val previewOrders = listOf(
    PreviewOrder(
        "DEMO-ORD-001",
        "in_transit",
        "Ada Demo",
        "Ikeja, Lagos → Yaba, Lagos",
        "NGN 8,500",
    ),
    PreviewOrder(
        "DEMO-ORD-002",
        "requested",
        "Tunde Sample",
        "Wuse 2, Abuja → Garki, Abuja",
        "Price not set",
    ),
)

private val previewShipments = listOf(
    PreviewShipment(
        "DEMO-PLS-NG-00042",
        "in_transit",
        "Ikeja, Lagos → Yaba, Lagos",
        listOf(
            PreviewEvent(
                "PICKED_UP",
                "manual",
                "pending review · sample",
                "Today, 09:15",
                "Ikeja, Lagos",
            ),
            PreviewEvent(
                "IN_TRANSIT",
                "first-party status mirror",
                "verified · sample",
                "Today, 09:22",
                "Location not recorded",
            ),
        ),
    ),
    PreviewShipment(
        "DEMO-PLS-NG-00043",
        "requested",
        "Wuse 2, Abuja → Garki, Abuja",
        listOf(
            PreviewEvent(
                "CREATED",
                "first-party status mirror",
                "verified · sample",
                "Today, 10:02",
                "Location not recorded",
            ),
        ),
    ),
)

private val previewCarriers = listOf(
    PreviewCarrier("Sample City Couriers", "Lagos, NG", "Lagos Mainland · Ikeja", "4.8 sample rating"),
    PreviewCarrier("Demo North Logistics", "Abuja, NG", "Abuja Municipal · Gwagwalada", "No sample rating"),
)

@Composable
internal fun DevelopmentPreview(onExit: () -> Unit) {
    var section by remember { mutableStateOf(PreviewSection.Orders) }

    SectionHeader("Development demo")
    Card(Modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                "MOCK DATA · DEBUG ONLY · OFFLINE",
                color = MaterialTheme.colorScheme.tertiary,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                "This read-only preview is invented example content. It is not live, " +
                    "is not written to Supabase, and cannot create or change a shipment.",
                style = MaterialTheme.typography.bodySmall,
            )
            androidx.compose.material3.TextButton(onClick = onExit) {
                Text("Return to sign in")
            }
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PreviewSection.entries.forEach { option ->
            FilterChip(
                selected = section == option,
                onClick = { section = option },
                label = { Text(option.title) },
            )
        }
    }

    when (section) {
        PreviewSection.Orders -> {
            SectionHeader("Sample orders")
            previewOrders.forEach { order ->
                PreviewCard {
                    PreviewBadge()
                    Text(order.reference, fontWeight = FontWeight.SemiBold)
                    Text(order.status.replace('_', ' '), style = MaterialTheme.typography.bodySmall)
                    Text(order.customer, style = MaterialTheme.typography.bodyMedium)
                    Text(order.route, style = MaterialTheme.typography.bodySmall)
                    Text(order.amount, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        PreviewSection.Shipments -> {
            SectionHeader("Sample shipment passports")
            previewShipments.forEach { shipment ->
                PreviewCard {
                    PreviewBadge()
                    Text(shipment.id, fontWeight = FontWeight.SemiBold)
                    Text("${shipment.status.replace('_', ' ')} · ${shipment.route}")
                    shipment.events.forEach { event ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                Modifier.padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Text(event.event.replace('_', ' '), fontWeight = FontWeight.Medium)
                                Text(
                                    "${event.verification} · ${event.source}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                Text(
                                    "${event.time} · ${event.location}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }

        PreviewSection.Carriers -> {
            SectionHeader("Sample carrier directory")
            previewCarriers.forEach { carrier ->
                PreviewCard {
                    PreviewBadge()
                    Text(carrier.name, fontWeight = FontWeight.SemiBold)
                    Text(carrier.location, style = MaterialTheme.typography.bodyMedium)
                    Text(carrier.serviceAreas, style = MaterialTheme.typography.bodySmall)
                    Text(carrier.rating, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun PreviewCard(content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
    }
}

@Composable
private fun PreviewBadge() {
    Text(
        "SAMPLE · NOT LIVE",
        color = MaterialTheme.colorScheme.tertiary,
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.labelSmall,
    )
}
