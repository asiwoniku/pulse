package com.pulse.logistics.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.logistics.BuildConfig
import com.pulse.logistics.core.model.DriverSummary
import com.pulse.logistics.core.model.DriverTask
import com.pulse.logistics.core.model.OrderSummary
import com.pulse.logistics.core.model.ShipmentEventSummary
import com.pulse.logistics.core.model.ShipmentSummary
import com.pulse.logistics.core.model.WorkspaceSummary
import com.pulse.logistics.core.network.Session
import com.pulse.logistics.core.network.SessionStore
import com.pulse.logistics.core.network.SupabaseApiException
import com.pulse.logistics.core.network.SupabaseClient
import com.pulse.logistics.data.AuthApi
import com.pulse.logistics.data.AuthOutcome
import com.pulse.logistics.data.OperationsApi
import com.pulse.logistics.data.OrdersApi
import com.pulse.logistics.data.ShipmentsApi
import com.pulse.logistics.data.WorkspaceApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PulseUiState(
    val configured: Boolean = true,
    val busy: Boolean = false,
    val message: String? = null,
    val failure: String? = null,
    val session: Session? = null,
    val workspaces: List<WorkspaceSummary> = emptyList(),
    val activeWorkspace: WorkspaceSummary? = null,
    val orders: List<OrderSummary> = emptyList(),
    val drivers: List<DriverSummary> = emptyList(),
    val history: List<String> = emptyList(),
    val tasks: List<DriverTask> = emptyList(),
    val shipments: List<ShipmentSummary> = emptyList(),
    val selectedShipmentId: String? = null,
    val shipmentEvents: List<ShipmentEventSummary> = emptyList(),
)

/**
 * Session, workspace in focus, and the read models. Mutations are extension
 * functions in `PulseViewModelActions.kt`. Every mutation is an RPC or a guarded PATCH
 * and the database's own message is what the operator reads: nothing is simulated
 * locally, including success.
 */
class PulseViewModel(application: Application) : AndroidViewModel(application) {

    internal val configured =
        BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
    internal val store = SessionStore(application)

    @Volatile
    internal var accessToken: String? = null

    internal val client by lazy {
        SupabaseClient(BuildConfig.SUPABASE_URL.trimEnd('/'), BuildConfig.SUPABASE_ANON_KEY) { accessToken }
    }
    internal val auth = AuthApi(client)
    internal val spaces = WorkspaceApi(client)
    internal val board = OrdersApi(client)
    internal val shipmentData = ShipmentsApi(client)
    internal val ops = OperationsApi(client)

    internal val _state = MutableStateFlow(PulseUiState(configured = configured))
    val state: StateFlow<PulseUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            store.session.collect { session ->
                accessToken = session?.accessToken
                _state.update { it.copy(session = session) }
                if (session != null && _state.value.workspaces.isEmpty()) loadWorkspaces()
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null, failure = null) }

    fun signIn(email: String, password: String) =
        guard { after(auth.signIn(email, password), "Signed in") }

    fun signUp(email: String, password: String, fullName: String, phone: String?) =
        guard { after(auth.signUp(email, password, fullName, phone), "Account created and signed in") }

    fun signOut() = viewModelScope.launch {
        accessToken = null
        store.clear()
        _state.update { PulseUiState(configured = configured) }
    }

    fun loadWorkspaces() = guard { reloadSpaces() }

    fun refreshShipments() = guard { reloadShipments() }

    fun selectShipment(shipmentId: String) = guard {
        val events = shipmentData.events(shipmentId)
        _state.update { it.copy(selectedShipmentId = shipmentId, shipmentEvents = events) }
    }

    fun clearSelectedShipment() = _state.update {
        it.copy(selectedShipmentId = null, shipmentEvents = emptyList())
    }

    fun selectWorkspace(id: String) = guard {
        val target = _state.value.workspaces.firstOrNull { it.id == id } ?: return@guard
        store.setActiveBusiness(target.id, target.name, target.role?.raw)
        _state.update {
            it.copy(
                activeWorkspace = target,
                shipments = emptyList(),
                selectedShipmentId = null,
                shipmentEvents = emptyList(),
            )
        }
        open(target)
    }

    private suspend fun after(outcome: AuthOutcome, notice: String) {
        when (outcome) {
            is AuthOutcome.SignedIn -> {
                store.save(outcome.session)
                accessToken = outcome.session.accessToken
                _state.update { it.copy(session = outcome.session, message = notice) }
                reloadSpaces()
            }

            is AuthOutcome.AwaitingConfirmation -> _state.update {
                it.copy(
                    message = "Confirmation is still pending for ${outcome.email}. " +
                        "Confirm the address, then sign in.",
                )
            }
        }
    }

    internal suspend fun reloadSpaces() {
        val list = spaces.workspaces(session().userId)
        val active = session().businessId?.let { id -> list.firstOrNull { it.id == id } } ?: list.firstOrNull()
        _state.update {
            it.copy(
                workspaces = list,
                activeWorkspace = active,
                message = if (list.isEmpty()) {
                    "You belong to no workspace yet. Create one or accept an invitation code."
                } else {
                    it.message
                },
            )
        }
        open(active)
    }

    internal suspend fun reloadBoard() {
        val id = workspace().id
        _state.update { it.copy(orders = board.board(id), drivers = board.drivers(id)) }
    }

    internal suspend fun reloadShipments() {
        _state.update { it.copy(shipments = shipmentData.shipments(workspace().id)) }
    }

    internal suspend fun reloadTasks() {
        _state.update { it.copy(tasks = board.myTasks(session().userId)) }
    }

    /** Staff land on the board, drivers on their tasks. */
    internal fun open(workspace: WorkspaceSummary?) {
        when {
            workspace == null -> Unit
            workspace.role?.isStaff == true -> refreshBoard()
            else -> refreshTasks()
        }
    }

    internal fun session(): Session =
        _state.value.session ?: throw SupabaseApiException("session", "no active session", 401)

    internal fun workspace(): WorkspaceSummary =
        _state.value.activeWorkspace ?: throw SupabaseApiException("workspace", "no workspace selected", 400)

    /** Runs work, surfacing the database's message verbatim rather than a generic one. */
    internal fun guard(work: suspend () -> Unit) {
        if (!configured) {
            _state.update {
                it.copy(
                    failure = "This build has no Supabase project. Set pulse.supabase.url and " +
                        "pulse.anon.key in android/local.properties, then rebuild.",
                )
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true, message = null, failure = null) }
            try {
                refreshTokenIfNeeded()
                work()
            } catch (error: SupabaseApiException) {
                _state.update { it.copy(failure = "${error.message} (code ${error.code})") }
            } catch (error: Exception) {
                _state.update { it.copy(failure = error.message ?: "the request did not complete") }
            } finally {
                _state.update { it.copy(busy = false) }
            }
        }
    }

    private suspend fun refreshTokenIfNeeded() {
        val current = _state.value.session ?: return
        if (!current.tokenExpiresWithin(120)) return
        val refreshed = auth.refresh(current.refreshToken)
        store.save(refreshed)
        accessToken = refreshed.accessToken
        _state.update { it.copy(session = refreshed) }
    }
}
