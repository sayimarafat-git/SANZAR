package com.sanzar.app

import android.app.Application
import androidx.room.Room
import androidx.work.*
import com.sanzar.app.data.auth.LogtoAuthManager
import com.sanzar.app.data.local.SanzarDatabase
import com.sanzar.app.data.local.UserPreferences
import com.sanzar.app.data.remote.ApiClient
import com.sanzar.app.data.remote.ResourceDownloader
import com.sanzar.app.sync.SyncWorker
import java.util.concurrent.TimeUnit

class SanzarApplication : Application() {
    lateinit var authManager: LogtoAuthManager
        private set

    lateinit var database: SanzarDatabase
        private set

    lateinit var preferences: UserPreferences
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var resourceDownloader: ResourceDownloader
        private set

    override fun onCreate() {
        super.onCreate()
        authManager = LogtoAuthManager(this)
        database = Room.databaseBuilder(
            applicationContext,
            SanzarDatabase::class.java,
            "sanzar.db"
        ).fallbackToDestructiveMigration().build()

        preferences = UserPreferences(applicationContext)
        apiClient = ApiClient(tokenProvider = { authManager.getAccessToken() })
        resourceDownloader = ResourceDownloader(applicationContext, database.installedResourceDao())

        schedulePeriodicSync()
    }

    private fun schedulePeriodicSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "SanzarSync",
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }

    fun triggerImmediateSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniqueWork(
            "SanzarImmediateSync",
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
