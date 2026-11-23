package com.sanzar.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.sanzar.app.SanzarApplication
import com.sanzar.app.data.remote.ApiClient
import com.sanzar.app.data.remote.ApiException
import org.json.JSONArray
import org.json.JSONObject

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as SanzarApplication
        val pendingDao = app.database.pendingSyncDao()
        val pending = pendingDao.getPending()

        if (pending.isEmpty()) return Result.success()
        if (FirebaseAuth.getInstance().currentUser == null) return Result.retry()

        val api = ApiClient()
        val operations = JSONArray()
        pending.forEach { op ->
            val payload = try {
                JSONObject(op.payloadJson)
            } catch (_: Exception) {
                JSONObject().put("raw", op.payloadJson)
            }
            operations.put(
                JSONObject().apply {
                    put("operationId", op.operationId)
                    put("type", op.type)
                    put("payload", payload)
                    put("createdAt", op.createdAt)
                }
            )
        }

        return try {
            api.syncBatch(operations)
            pendingDao.markSynced(pending.map { it.operationId })
            pendingDao.pruneSynced()
            app.preferences.setLastSyncAt(System.currentTimeMillis())
            Result.success()
        } catch (e: ApiException) {
            if (e.isNetwork || e.status >= 500 || e.status == 429 || e.status == 401) {
                Result.retry()
            } else {
                // Drop invalid operations so they do not permanently block the queue
                pendingDao.markSynced(pending.map { it.operationId })
                Result.success()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
