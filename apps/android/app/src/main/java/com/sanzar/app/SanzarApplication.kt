package com.sanzar.app

import android.app.Application
import androidx.room.Room
import androidx.work.*
import com.sanzar.app.data.local.SanzarDatabase
import com.sanzar.app.sync.SyncWorker
import java.util.concurrent.TimeUnit

class SanzarApplication : Application() {
    lateinit var database: SanzarDatabase
        private set

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(
            applicationContext,
            SanzarDatabase::class.java,
            "sanzar.db"
        ).fallbackToDestructiveMigration().build()

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
}
