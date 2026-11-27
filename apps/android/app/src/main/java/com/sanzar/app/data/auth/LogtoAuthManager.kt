package com.sanzar.app.data.auth

import android.app.Activity
import android.app.Application
import com.sanzar.app.BuildConfig
import io.logto.sdk.android.LogtoClient
import io.logto.sdk.android.type.LogtoConfig
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

data class AuthUser(
    val uid: String,
    val email: String? = null,
    val displayName: String? = null,
    val isEmailVerified: Boolean = true
)

class LogtoAuthManager(application: Application) {
    companion object {
        const val ENDPOINT = "https://ugtpcv.logto.app/"
        const val APP_ID = "7xlpiztpwndj79tcas1tf"
        val REDIRECT_URI: String get() = "${BuildConfig.APPLICATION_ID}://callback"
    }

    private val config = LogtoConfig(
        endpoint = ENDPOINT,
        appId = APP_ID,
        scopes = listOf("openid", "profile", "email", "offline_access")
    )

    val client = LogtoClient(config, application)

    val isAuthenticated: Boolean
        get() = client.isAuthenticated

    fun currentUser(): AuthUser? {
        if (!client.isAuthenticated) return null
        val claims = try {
            client.getIdTokenClaims()
        } catch (_: Exception) {
            null
        } ?: return null
        return AuthUser(
            uid = claims.sub,
            email = claims.email,
            displayName = claims.name ?: claims.username ?: claims.email?.substringBefore("@"),
            isEmailVerified = true
        )
    }

    suspend fun getAccessToken(): String? {
        if (!client.isAuthenticated) return null
        return try {
            client.idToken
        } catch (_: Exception) {
            null
        }
    }

    fun signIn(activity: Activity, onComplete: (Throwable?) -> Unit) {
        client.signIn(activity, REDIRECT_URI) { exception ->
            onComplete(exception)
        }
    }

    fun signOut(onComplete: (Throwable?) -> Unit) {
        client.signOut { exception ->
            onComplete(exception)
        }
    }
}
