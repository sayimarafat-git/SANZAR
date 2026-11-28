package com.sanzar.app.data.remote

import com.sanzar.app.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(
    val status: Int,
    override val message: String,
    val isNetwork: Boolean = false
) : Exception(message)

data class ApiResponse(
    val status: Int,
    val body: String,
    val etag: String?
) {
    fun optJson(): JSONObject? = try {
        if (body.isBlank()) null else JSONObject(body)
    } catch (_: Exception) {
        null
    }
}

class ApiClient(
    private val baseUrl: String = "https://api.sanzar.pro",
    private val tokenProvider: suspend () -> String? = { null }
) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private suspend fun getToken(): String? = try {
        tokenProvider()
    } catch (_: Exception) {
        null
    }

    suspend fun send(
        method: String,
        path: String,
        bodyJson: JSONObject? = null,
        headers: Map<String, String> = emptyMap(),
        requireAuth: Boolean = true
    ): ApiResponse = withContext(Dispatchers.IO) {
        val token = getToken()
        if (requireAuth && token == null) {
            throw ApiException(401, "Not authenticated")
        }

        val reqBuilder = Request.Builder()
            .url("$baseUrl$path")
            .addHeader("Accept", "application/json")

        if (token != null) {
            reqBuilder.addHeader("Authorization", "Bearer $token")
        }
        headers.forEach { (k, v) -> reqBuilder.addHeader(k, v) }

        val requestBody = bodyJson?.toString()?.toRequestBody(jsonMediaType)
        when (method.uppercase()) {
            "GET" -> reqBuilder.get()
            "POST" -> reqBuilder.post(requestBody ?: "{}".toRequestBody(jsonMediaType))
            "PATCH" -> reqBuilder.patch(requestBody ?: "{}".toRequestBody(jsonMediaType))
            "PUT" -> reqBuilder.put(requestBody ?: "{}".toRequestBody(jsonMediaType))
            "DELETE" -> reqBuilder.delete(requestBody)
            else -> reqBuilder.method(method, requestBody)
        }

        try {
            client.newCall(reqBuilder.build()).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                val etag = resp.header("ETag")
                if (resp.code == 304) {
                    return@withContext ApiResponse(304, "", etag)
                }
                if (!resp.isSuccessful) {
                    val errMsg = try {
                        JSONObject(raw).optString("error").ifBlank {
                            JSONObject(raw).optString("message")
                        }
                    } catch (_: Exception) {
                        ""
                    }.ifBlank { "HTTP ${resp.code}" }
                    throw ApiException(resp.code, errMsg)
                }
                ApiResponse(resp.code, raw, etag)
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: IOException) {
            throw ApiException(0, e.message ?: "Network error", isNetwork = true)
        }
    }

    suspend fun getMe(): Profile {
        val resp = send("GET", "/v1/me")
        val j = resp.optJson() ?: JSONObject()
        val userObj = j.optJSONObject("user") ?: j
        return Profile.fromJson(userObj)
    }

    suspend fun updateMe(changes: Map<String, Any?>): Profile {
        val body = JSONObject().apply {
            changes.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) }
        }
        val resp = send("PATCH", "/v1/me", body)
        val j = resp.optJson() ?: JSONObject()
        val userObj = j.optJSONObject("user") ?: j
        return Profile.fromJson(userObj)
    }

    suspend fun deleteMe() {
        send("DELETE", "/v1/me")
    }

    suspend fun fetchCatalog(etag: String?): Pair<Catalog?, Pair<String, String?>?> {
        val headers = if (etag.isNullOrBlank()) emptyMap() else mapOf("If-None-Match" to etag)
        val resp = send("GET", "/v1/catalog", headers = headers, requireAuth = false)
        if (resp.status == 304) return null to null
        val j = resp.optJson() ?: JSONObject()
        return Catalog.fromJson(j) to (resp.body to resp.etag)
    }

    suspend fun fetchProgress(): ProgressData {
        val resp = send("GET", "/v1/progress")
        return ProgressData.fromJson(resp.optJson() ?: JSONObject())
    }

    suspend fun sendStudyEvents(events: List<JSONObject>): JSONObject {
        val arr = JSONArray()
        events.forEach { arr.put(it) }
        val resp = send("POST", "/v1/study/events", JSONObject().put("events", arr))
        return resp.optJson() ?: JSONObject()
    }

    suspend fun completeItem(itemId: String): JSONObject {
        val resp = send("POST", "/v1/completions", JSONObject().put("itemId", itemId))
        return resp.optJson() ?: JSONObject()
    }

    suspend fun askTutor(question: String, prev: TutorReference? = null): TutorAnswer {
        val body = JSONObject().put("q", question)
        if (prev != null) {
            body.put("prev", JSONObject().put("chapterId", prev.chapterId).put("section", prev.section))
        }
        val resp = send("POST", "/v1/tutor/ask", body)
        return TutorAnswer.fromJson(resp.optJson() ?: JSONObject())
    }

    suspend fun startExam(examId: String): ExamSession {
        val resp = send("POST", "/v1/exams/$examId/start", JSONObject())
        return ExamSession.fromJson(resp.optJson() ?: JSONObject())
    }

    suspend fun submitExam(attemptId: String, answers: Map<String, Int>): AttemptResult {
        val ansObj = JSONObject()
        answers.forEach { (k, v) -> ansObj.put(k, v) }
        val resp = send("POST", "/v1/attempts/$attemptId/submit", JSONObject().put("answers", ansObj))
        return AttemptResult.fromJson(resp.optJson() ?: JSONObject())
    }

    suspend fun fetchAttempt(attemptId: String): AttemptResult {
        val resp = send("GET", "/v1/attempts/$attemptId")
        return AttemptResult.fromJson(resp.optJson() ?: JSONObject())
    }

    suspend fun fetchAttempts(): List<AttemptSummary> {
        val resp = send("GET", "/v1/attempts")
        val arr = resp.optJson()?.optJSONArray("attempts") ?: return emptyList()
        return List(arr.length()) { AttemptSummary.fromJson(arr.getJSONObject(it)) }
    }

    suspend fun fetchLeaderboard(period: String, levelId: String? = null): Pair<List<LeaderEntry>, LeaderEntry?> {
        val q = buildString {
            append("period=$period")
            if (!levelId.isNullOrBlank()) append("&level=$levelId")
        }
        val resp = send("GET", "/v1/leaderboard?$q")
        val j = resp.optJson() ?: JSONObject()
        val arr = j.optJSONArray("entries")
        val list = if (arr == null) emptyList() else List(arr.length()) {
            LeaderEntry.fromJson(arr.getJSONObject(it))
        }
        val me = j.optJSONObject("me")?.let { LeaderEntry.fromJson(it) }
        return list to me
    }

    suspend fun fetchFeed(before: Long? = null, category: String? = null, query: String? = null): Pair<List<Post>, Long?> {
        val params = buildList {
            if (before != null) add("before=$before")
            if (!category.isNullOrBlank()) add("category=$category")
            if (!query.isNullOrBlank()) add("q=${java.net.URLEncoder.encode(query.trim(), "UTF-8")}")
        }.joinToString("&")
        val resp = send("GET", "/v1/feed${if (params.isEmpty()) "" else "?$params"}")
        val j = resp.optJson() ?: JSONObject()
        val arr = j.optJSONArray("posts")
        val posts = if (arr == null) emptyList() else List(arr.length()) {
            Post.fromJson(arr.getJSONObject(it))
        }
        val next = if (j.isNull("next") || !j.has("next")) null else j.optLong("next")
        return posts to next
    }

    suspend fun createPost(
        text: String,
        category: String = "general",
        pollQuestion: String? = null,
        pollOptions: List<String>? = null,
        attachments: List<PostAttachment> = emptyList()
    ): JSONObject {
        val body = JSONObject().apply {
            put("text", text)
            put("category", category)
            put("attachments", JSONArray().apply { attachments.forEach { put(it.toJson()) } })
            if (!pollQuestion.isNullOrBlank() && !pollOptions.isNullOrEmpty()) {
                put("poll", JSONObject().apply {
                    put("question", pollQuestion)
                    put("options", JSONArray().apply { pollOptions.forEach { put(it) } })
                })
            }
        }
        val resp = send("POST", "/v1/posts", body)
        return resp.optJson() ?: JSONObject()
    }

    suspend fun deletePost(postId: String) {
        send("DELETE", "/v1/posts/$postId")
    }

    suspend fun toggleLike(postId: String): Pair<Boolean, Int> {
        val resp = send("POST", "/v1/posts/$postId/like", JSONObject())
        val j = resp.optJson() ?: JSONObject()
        return j.optBoolean("liked", false) to j.optInt("likeCount", 0)
    }

    suspend fun votePoll(postId: String, option: Int): Poll {
        val resp = send("POST", "/v1/posts/$postId/vote", JSONObject().put("option", option))
        val j = resp.optJson()?.optJSONObject("poll") ?: JSONObject()
        return Poll.fromJson(j)
    }

    suspend fun fetchComments(postId: String): List<Comment> {
        val resp = send("GET", "/v1/posts/$postId/comments")
        val arr = resp.optJson()?.optJSONArray("comments") ?: return emptyList()
        return List(arr.length()) { Comment.fromJson(arr.getJSONObject(it)) }
    }

    suspend fun addComment(postId: String, text: String): Comment {
        val resp = send("POST", "/v1/posts/$postId/comments", JSONObject().put("text", text))
        val j = resp.optJson()?.optJSONObject("comment") ?: JSONObject()
        return Comment.fromJson(j)
    }

    suspend fun deleteComment(commentId: String) {
        send("DELETE", "/v1/comments/$commentId")
    }

    suspend fun reportTarget(targetType: String, targetId: String, reason: String) {
        send(
            "POST",
            "/v1/reports",
            JSONObject()
                .put("targetType", targetType)
                .put("targetId", targetId)
                .put("reason", reason)
        )
    }

    suspend fun setFollow(uid: String, follow: Boolean) {
        if (follow) send("POST", "/v1/users/$uid/follow", JSONObject())
        else send("DELETE", "/v1/users/$uid/follow")
    }

    suspend fun setBlock(uid: String, block: Boolean) {
        if (block) send("POST", "/v1/users/$uid/block", JSONObject())
        else send("DELETE", "/v1/users/$uid/block")
    }

    suspend fun fetchPublicProfile(uid: String): PublicProfile {
        val resp = send("GET", "/v1/users/$uid")
        val j = resp.optJson() ?: JSONObject()
        val u = j.optJSONObject("user") ?: JSONObject()
        return PublicProfile(
            uid = u.optString("uid"),
            name = u.optString("name"),
            visibility = u.optString("visibility", "public"),
            levelId = u.optString("levelId").ifBlank { null },
            institution = u.optString("institution").ifBlank { null },
            xp = if (u.isNull("xp") || !u.has("xp")) null else u.optInt("xp"),
            followers = j.optInt("followers"),
            following = j.optInt("following"),
            isFollowing = j.optBoolean("isFollowing"),
            limited = j.optBoolean("limited")
        )
    }

    suspend fun fetchNotifications(): Pair<List<AppNotification>, Int> {
        val resp = send("GET", "/v1/notifications")
        val j = resp.optJson() ?: JSONObject()
        val arr = j.optJSONArray("notifications")
        val list = if (arr == null) emptyList() else List(arr.length()) {
            AppNotification.fromJson(arr.getJSONObject(it))
        }
        return list to j.optInt("unread", 0)
    }

    suspend fun markNotificationsRead(id: String? = null) {
        val body = JSONObject().apply {
            if (!id.isNullOrBlank()) put("id", id)
        }
        send("POST", "/v1/notifications/read", body)
    }

    suspend fun fetchDictionary(
        query: String = "",
        lang: String = "all",
        hskLevel: String = "",
        partOfSpeech: String = "",
        cursor: String? = null
    ): Triple<List<DictionaryEntry>, String?, Boolean> {
        val params = buildList {
            if (lang == "zh" || lang == "zh-Hans" || lang == "en" || lang == "bn") add("lang=$lang")
            if (query.isNotBlank()) add("q=${java.net.URLEncoder.encode(query.trim(), "UTF-8")}")
            if (hskLevel.isNotBlank()) add("hsk_level=${java.net.URLEncoder.encode(hskLevel, "UTF-8")}")
            if (partOfSpeech.isNotBlank()) add("part_of_speech=${java.net.URLEncoder.encode(partOfSpeech, "UTF-8")}")
            if (!cursor.isNullOrBlank()) add("cursor=${java.net.URLEncoder.encode(cursor, "UTF-8")}")
            add("limit=40")
        }.joinToString("&")
        val resp = send("GET", "/v1/dictionary${if (params.isEmpty()) "" else "?$params"}", requireAuth = false)
        val j = resp.optJson() ?: return Triple(emptyList(), null, false)
        val arr = j.optJSONArray("entries") ?: return Triple(emptyList(), null, false)
        val entries = List(arr.length()) { DictionaryEntry.fromJson(arr.getJSONObject(it)) }
        val nextCursor = j.optString("nextCursor", "").ifBlank { null }
        val hasMore = j.optBoolean("hasMore", false)
        return Triple(entries, nextCursor, hasMore)
    }

    suspend fun translateText(text: String, sourceLanguage: String, targetLanguage: String): JSONObject {
        val body = JSONObject().apply {
            put("text", text)
            put("sourceLanguage", sourceLanguage)
            put("targetLanguage", targetLanguage)
        }
        val resp = send("POST", "/v1/translation", body)
        return resp.optJson() ?: JSONObject()
    }

    suspend fun fetchSavedVocabulary(): JSONArray {
        val resp = send("GET", "/v1/dictionary/saved")
        return resp.optJson()?.optJSONArray("items") ?: JSONArray()
    }

    suspend fun upsertSavedVocabulary(item: JSONObject): JSONObject {
        val resp = send("POST", "/v1/dictionary/saved", JSONObject().put("items", JSONArray().put(item)))
        return resp.optJson() ?: JSONObject()
    }

    suspend fun deleteSavedVocabulary(id: String) {
        send("DELETE", "/v1/dictionary/saved/${java.net.URLEncoder.encode(id, "UTF-8")}")
    }

    suspend fun fetchTranslationHistory(): JSONArray {
        val resp = send("GET", "/v1/translation/history")
        return resp.optJson()?.optJSONArray("items") ?: JSONArray()
    }

    suspend fun syncTranslationHistoryItem(item: JSONObject): JSONObject {
        val resp = send("POST", "/v1/translation/history/batch", JSONObject().put("items", JSONArray().put(item)))
        return resp.optJson() ?: JSONObject()
    }

    suspend fun deleteTranslationHistory(id: String) {
        send("DELETE", "/v1/translation/history/${java.net.URLEncoder.encode(id, "UTF-8")}")
    }

    suspend fun fetchResourceManifest(): List<ResourceManifestItem> {
        val resp = send("GET", "/v1/resources/manifest", requireAuth = false)
        val j = resp.optJson() ?: JSONObject()
        val arr = j.optJSONArray("resources") ?: j.optJSONArray("items") ?: return emptyList()
        return List(arr.length()) { ResourceManifestItem.fromJson(arr.getJSONObject(it)) }
    }

    suspend fun syncBatch(operations: JSONArray): JSONObject {
        val resp = send("POST", "/v1/sync", JSONObject().put("operations", operations))
        return resp.optJson() ?: JSONObject()
    }
}
