// Pulse is not an application server: nothing here starts a backend. The
// business rules live in supabase/migrations and are enforced by Postgres.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
