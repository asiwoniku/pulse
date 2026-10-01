package com.pulse.logistics.core.network

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.sessionStore: DataStore<Preferences> by preferencesDataStore(name = "pulse_session")

/**
 * What the app knows about the signed-in user. Mirrors the Supabase session plus
 * the workspace the user last acted inside; nothing else is cached, because the
 * database is the authority on roles and availability.
 */
data class Session(
    val userId: String,
    val email: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSec: Long,
    val businessId: String? = null,
    val businessName: String? = null,
    val role: String? = null,
) {
    fun tokenExpiresWithin(seconds: Long): Boolean =
        System.currentTimeMillis() / 1000L + seconds >= expiresAtEpochSec
}

class SessionStore(private val context: Context) {

    val session: Flow<Session?> = context.sessionStore.data.map { prefs ->
        val token = prefs[ACCESS_TOKEN] ?: return@map null
        Session(
            userId = prefs[USER_ID] ?: return@map null,
            email = prefs[EMAIL] ?: "",
            accessToken = token,
            refreshToken = prefs[REFRESH_TOKEN] ?: return@map null,
            expiresAtEpochSec = prefs[EXPIRES_AT] ?: 0L,
            businessId = prefs[BUSINESS_ID],
            businessName = prefs[BUSINESS_NAME],
            role = prefs[ROLE],
        )
    }

    suspend fun save(session: Session) {
        context.sessionStore.edit { prefs ->
            prefs[USER_ID] = session.userId
            prefs[EMAIL] = session.email
            prefs[ACCESS_TOKEN] = session.accessToken
            prefs[REFRESH_TOKEN] = session.refreshToken
            prefs[EXPIRES_AT] = session.expiresAtEpochSec
            session.businessId?.let { prefs[BUSINESS_ID] = it } ?: prefs.remove(BUSINESS_ID)
            session.businessName?.let { prefs[BUSINESS_NAME] = it } ?: prefs.remove(BUSINESS_NAME)
            session.role?.let { prefs[ROLE] = it } ?: prefs.remove(ROLE)
        }
    }

    /** Records the workspace the user switched into, so both clients send the same `pulse.business_id`. */
    suspend fun setActiveBusiness(businessId: String, businessName: String?, role: String?) {
        context.sessionStore.edit { prefs ->
            prefs[BUSINESS_ID] = businessId
            if (businessName == null) prefs.remove(BUSINESS_NAME) else prefs[BUSINESS_NAME] = businessName
            if (role == null) prefs.remove(ROLE) else prefs[ROLE] = role
        }
    }

    suspend fun clear() {
        context.sessionStore.edit(Preferences.MutablePreferences::clear)
    }

    private companion object {
        val USER_ID = stringPreferencesKey("user_id")
        val EMAIL = stringPreferencesKey("email")
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val EXPIRES_AT = longPreferencesKey("expires_at_epoch_sec")
        val BUSINESS_ID = stringPreferencesKey("business_id")
        val BUSINESS_NAME = stringPreferencesKey("business_name")
        val ROLE = stringPreferencesKey("role")
    }
}
