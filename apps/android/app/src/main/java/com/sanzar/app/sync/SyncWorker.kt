package com.sanzar.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.sanzar.app.SanzarApplication
import kotlinx.coroutines.tasks.await
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class SyncWorker(appContext: Context, workerParams: WorkerParameters) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val app = applicationContext as SanzarApplication
        val dao = app.database.learningDao()
        val pending = dao.getPendingSyncProgress()

        if (pending.isEmpty()) return Result.success()

        val currentUser = FirebaseAuth.getInstance().currentUser ?: return Result.retry()
        val token = try {
            currentUser.getIdToken(false).await()?.token
        } catch (e: Exception) {
            return Result.retry()
        } ?: return Result.retry()

        val client = OkHttpClient()
        val jsonArray = JSONArray()
        pending.forEach {
            jsonArray.put(JSONObject().apply {
                put("id", it.id)
                put("courseId", it.courseId)
                put("lessonId", it.lessonId)
                put("score", it.score)
                put("isCompleted", it.isCompleted)
                put("updatedAt", it.updatedAt)
            })
        }

        val requestBody = JSONObject().apply { put("items", jsonArray) }.toString()
            .toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("https://sanzar-api.workers.dev/v1/sync")
            .addHeader("Authorization", "Bearer $token")
            .post(requestBody)
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                pending.forEach { dao.markSynced(it.id) }
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
