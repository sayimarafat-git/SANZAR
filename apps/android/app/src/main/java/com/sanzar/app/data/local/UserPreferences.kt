package com.sanzar.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.sanzarDataStore: DataStore<Preferences> by preferencesDataStore(name = "sanzar_prefs")

data class UserPrefState(
    val onboarded: Boolean = false,
    val themeMode: String = "light",
    val language: String = "bn",
    val selectedLevelId: String? = null,
    val guestMode: Boolean = false,
    val catalogEtag: String? = null,
    val catalogJson: String? = null,
    val lastSyncAt: Long = 0L
)

class UserPreferences(private val context: Context) {
    private object Keys {
        val ONBOARDED = booleanPreferencesKey("onboarded")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val LANGUAGE = stringPreferencesKey("language")
        val SELECTED_LEVEL_ID = stringPreferencesKey("selected_level_id")
        val GUEST_MODE = booleanPreferencesKey("guest_mode")
        val CATALOG_ETAG = stringPreferencesKey("catalog_etag")
        val CATALOG_JSON = stringPreferencesKey("catalog_json")
        val LAST_SYNC_AT = longPreferencesKey("last_sync_at")
    }

    val state: Flow<UserPrefState> = context.sanzarDataStore.data.map { prefs ->
        val rawTheme = prefs[Keys.THEME_MODE]
        UserPrefState(
            onboarded = prefs[Keys.ONBOARDED] ?: false,
            themeMode = if (rawTheme == "dark") "dark" else "light",
            language = prefs[Keys.LANGUAGE] ?: "bn",
            selectedLevelId = prefs[Keys.SELECTED_LEVEL_ID],
            guestMode = prefs[Keys.GUEST_MODE] ?: false,
            catalogEtag = prefs[Keys.CATALOG_ETAG],
            catalogJson = prefs[Keys.CATALOG_JSON],
            lastSyncAt = prefs[Keys.LAST_SYNC_AT] ?: 0L
        )
    }

    suspend fun setOnboarded(value: Boolean) {
        context.sanzarDataStore.edit { it[Keys.ONBOARDED] = value }
    }

    suspend fun setThemeMode(mode: String) {
        context.sanzarDataStore.edit { it[Keys.THEME_MODE] = mode }
    }

    suspend fun setLanguage(lang: String) {
        context.sanzarDataStore.edit { it[Keys.LANGUAGE] = lang }
    }

    suspend fun setSelectedLevelId(levelId: String?) {
        context.sanzarDataStore.edit {
            if (levelId.isNullOrBlank()) it.remove(Keys.SELECTED_LEVEL_ID)
            else it[Keys.SELECTED_LEVEL_ID] = levelId
        }
    }

    suspend fun setGuestMode(enabled: Boolean) {
        context.sanzarDataStore.edit { it[Keys.GUEST_MODE] = enabled }
    }

    suspend fun saveCatalogCache(json: String, etag: String?) {
        context.sanzarDataStore.edit {
            it[Keys.CATALOG_JSON] = json
            if (etag != null) it[Keys.CATALOG_ETAG] = etag
        }
    }

    suspend fun setLastSyncAt(epochMillis: Long) {
        context.sanzarDataStore.edit { it[Keys.LAST_SYNC_AT] = epochMillis }
    }

    suspend fun clearAuthBoundData() {
        context.sanzarDataStore.edit {
            it[Keys.GUEST_MODE] = false
        }
    }
}
