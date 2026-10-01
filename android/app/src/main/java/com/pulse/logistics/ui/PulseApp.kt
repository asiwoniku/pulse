package com.pulse.logistics.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pulse.logistics.core.model.BusinessRole
import com.pulse.logistics.core.model.DeliveryEvent
import com.pulse.logistics.core.model.DriverStatus
import com.pulse.logistics.core.model.OrderStatus

/**
 * The whole surface in one file: sign in, workspace setup, dispatch board, driver
 * tasks. Panels render only what the database returned and offer only the actions the
 * mirrored state machine allows; a refusal from the server is shown verbatim.
 */
@Composable
fun PulseApp(vm: PulseViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    Shell(state, vm) {
        when {
            state.session == null -> AuthPanel(state, vm)
            state.workspaces.isEmpty() -> SetupPanel(state, vm)
            else -> WorkspacePanel(state, vm)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Shell(state: PulseUiState, vm: PulseViewModel, content: @Composable () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.activeWorkspace?.name ?: "Pulse") },
                actions = {
                    if (state.session != null) {
                        TextButton(onClick = { vm.loadWorkspaces() }) { Text("Workspaces") }
                        TextButton(onClick = { vm.signOut() }) { Text("Sign out") }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!state.configured) {
                MessageBanner(
                    "No Supabase project is configured in this build. Set pulse.supabase.url and " +
                        "pulse.anon.key in android/local.properties.",
                    MessageKind.Unconfigured,
                )
            }
            state.message?.let { MessageBanner(it, MessageKind.Info) }
            state.failure?.let { MessageBanner(it, MessageKind.Error) }
            BusyRow(state.busy)
            content()
        }
    }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}
@Composable
private fun AuthPanel(state: PulseUiState, vm: PulseViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                if (register) "Create an account" else "Sign in",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Field(email, { email = it }, "Email")
            Field(password, { password = it }, "Password")
            if (register) {
                Field(fullName, { fullName = it }, "Full name")
                Field(phone, { phone = it }, "Phone +234…")
            }
            Button(
                onClick = {
                    if (register) vm.signUp(email, password, fullName, phone) else vm.signIn(email, password)
                },
                enabled = email.isNotBlank() && password.length >= 6 && !state.busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (register) "Create account" else "Sign in") }
            TextButton(onClick = { register = !register }) {
                Text(if (register) "I already have an account" else "Need an account? Create one")
            }
        }
    }
}

@Composable
private fun SetupPanel(state: PulseUiState, vm: PulseViewModel) {
    var name by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    SectionHeader("First workspace")
    Field(name, { name = it }, "Business name")
    Field(city, { city = it }, "City")
    Button(
        onClick = { vm.createBusiness(name, city, null) },
        enabled = name.length >= 2 && !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Create workspace") }

    SectionHeader("Join with an invitation code")
    Field(code, { code = it }, "Code from the owner")
    OutlinedButton(
        onClick = { vm.acceptInvitation(code) },
        enabled = code.isNotBlank() && !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Accept invitation") }
}
@Composable
private fun WorkspacePanel(state: PulseUiState, vm: PulseViewModel) {
    val workspace = state.activeWorkspace ?: return
    var showDriver by remember { mutableStateOf(false) }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(workspace.role?.label ?: "member", fontWeight = FontWeight.SemiBold)
        Text("${state.orders.size} order(s) visible to you", style = MaterialTheme.typography.bodySmall)
    }
    if (state.workspaces.size > 1) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            state.workspaces.forEach { ws ->
                FilterChip(
                    selected = ws.id == workspace.id,
                    onClick = { vm.selectWorkspace(ws.id) },
                    label = { Text(ws.name) },
                )
            }
        }
    }
    if (workspace.role?.canOperate == true && !showDriver) {
        DispatchPanel(state, vm)
        OutlinedButton(onClick = { vm.refreshTasks(); showDriver = true }) { Text("My driver tasks") }
    } else {
        DriverPanel(state, vm)
        if (workspace.role?.canOperate == true) {
            OutlinedButton(onClick = { showDriver = false; vm.refreshBoard() }) { Text("Dispatch board") }
        }
    }
}

@Composable
private fun DispatchPanel(state: PulseUiState, vm: PulseViewModel) {
    var actingOn by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var pickup by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }
    var driverId by remember { mutableStateOf<String?>(null) }
    var inviteEmail by remember { mutableStateOf("") }

    SectionHeader("New order")
    Field(name, { name = it }, "Customer name")
    Field(phone, { phone = it }, "Customer phone +234…")
    Field(pickup, { pickup = it }, "Pickup")
    Field(destination, { destination = it }, "Destination")
    Button(
        onClick = { vm.createOrder(name, phone, pickup, destination, null) },
        enabled = phone.startsWith("+") && pickup.length >= 3 && destination.length >= 3 && !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Create order") }

    SectionHeader("Board")
    if (state.orders.isEmpty()) {
        Text("No orders yet in this workspace. Orders only appear from real requests.",
            style = MaterialTheme.typography.bodySmall)
    }
    state.orders.forEach { order ->
        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(order.reference, fontWeight = FontWeight.SemiBold)
                    StatusChip(order.status, order.rawStatus)
                }
                Text(order.customerName, style = MaterialTheme.typography.bodyMedium)
                Text("${order.pickup} → ${order.dropoff}", style = MaterialTheme.typography.bodySmall)
                Text(
                    (order.price?.let { "$it ${order.currency.orEmpty()}" } ?: "no price recorded") +
                        " · ${order.paymentStatus?.label ?: "payment state unset"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { vm.showTrail(order.id) }) { Text("Trail") }
                    OutlinedButton(onClick = { actingOn = order.id }) { Text("Act") }
                }
                if (actingOn == order.id) {
                    // Staff request only the non-execution stages; migration 0006 decides.
                    val from = order.status ?: OrderStatus.Requested
                    OrderStatus.allowedNext(from)
                        .filterNot { it in OrderStatus.driverStages }
                        .forEach { next ->
                            OutlinedButton(onClick = { vm.moveStatus(order.id, next) }) { Text(next.label) }
                        }
                    SectionHeader("Assign a driver")
                    if (state.drivers.isEmpty()) {
                        Text("No driver rows here yet. Invite a worker first.",
                            style = MaterialTheme.typography.bodySmall)
                    }
                    state.drivers.forEach { driver ->
                        FilterChip(
                            selected = driverId == driver.id,
                            onClick = { driverId = driver.id },
                            label = { Text("${driver.name} · ${driver.status?.label ?: "status unset"}") },
                        )
                    }
                    Button(
                        onClick = { driverId?.let { vm.assign(order.id, it) } },
                        enabled = driverId != null && !state.busy,
                    ) { Text("Send assignment") }
                }
            }
        }
    }

    if (state.history.isNotEmpty()) {
        SectionHeader("Status trail")
        state.history.forEach { line -> Text(line, style = MaterialTheme.typography.bodySmall) }
    }

    SectionHeader("Invite a driver")
    Field(inviteEmail, { inviteEmail = it }, "Worker email")
    OutlinedButton(
        onClick = { vm.invite(inviteEmail, BusinessRole.Driver, null) },
        enabled = inviteEmail.contains("@") && !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Send invitation") }
}
@Composable
private fun DriverPanel(state: PulseUiState, vm: PulseViewModel) {
    SectionHeader("Availability")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DriverStatus.entries.filter { it != DriverStatus.Suspended }.forEach { status ->
            OutlinedButton(onClick = { vm.setAvailability(status) }, enabled = !state.busy) { Text(status.label) }
        }
    }
    OutlinedButton(onClick = { vm.refreshTasks() }, enabled = !state.busy) { Text("Reload my tasks") }

    SectionHeader("My assignments")
    if (state.tasks.isEmpty()) {
        Text(
            "No current assignment. Either nothing is assigned to you, or no drivers row is " +
                "linked to this account.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
    state.tasks.forEach { task ->
        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(task.reference, fontWeight = FontWeight.SemiBold)
                    StatusChip(task.status, task.rawStatus)
                }
                Text(task.dropoff, style = MaterialTheme.typography.bodyMedium)
                Text(task.customerPhone ?: "no customer phone on row",
                    style = MaterialTheme.typography.bodySmall)
                Text("Assignment ${task.assignmentStatus?.label ?: "state unset"}",
                    style = MaterialTheme.typography.bodySmall)

                if (task.assignmentStatus?.raw == "pending") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { vm.respond(task.assignmentId, true, null) }, enabled = !state.busy) {
                            Text("Accept")
                        }
                        OutlinedButton(
                            onClick = { vm.respond(task.assignmentId, false, "declined in the app") },
                            enabled = !state.busy,
                        ) { Text("Decline") }
                    }
                }

                val from = task.status ?: OrderStatus.Assigned
                OrderStatus.allowedNext(from)
                    .filter { it in OrderStatus.driverStages }
                    .forEach { next ->
                        OutlinedButton(onClick = { vm.moveStatus(task.orderId, next) }, enabled = !state.busy) {
                            Text(next.label)
                        }
                    }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        DeliveryEvent.DeliveryAttempted,
                        DeliveryEvent.WrongAddress,
                        DeliveryEvent.CustomerDeclined,
                    ).forEach { event ->
                        OutlinedButton(
                            onClick = { vm.recordAttempt(task.orderId, event, null) },
                            enabled = !state.busy,
                        ) { Text(event.label) }
                    }
                }

                var deliveredTo by remember(task.assignmentId) { mutableStateOf("") }
                var otp by remember(task.assignmentId) { mutableStateOf("") }
                Field(deliveredTo, { deliveredTo = it }, "Received by")
                if (task.requiresOtp) Field(otp, { otp = it }, "Customer OTP")
                // Proof capture is the honest path to `delivered`: no artefacts, no delivery.
                Button(
                    onClick = { vm.captureProof(task.orderId, deliveredTo, null, otp) },
                    enabled = deliveredTo.isNotBlank() && (!task.requiresOtp || otp.isNotBlank()) && !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Capture proof and mark delivered") }
            }
        }
    }
}
