package com.sanzar.app.data.model

import org.json.JSONArray
import org.json.JSONObject

private fun JSONObject.str(key: String, default: String = ""): String =
    if (isNull(key)) default else optString(key, default)

private fun JSONObject.strOrNull(key: String): String? =
    if (isNull(key) || !has(key)) null else optString(key).takeIf { it.isNotEmpty() }

private fun JSONObject.intVal(key: String, default: Int = 0): Int =
    if (isNull(key)) default else optInt(key, default)

private fun JSONObject.intOrNull(key: String): Int? =
    if (isNull(key) || !has(key)) null else optInt(key)

private fun JSONObject.longVal(key: String, default: Long = 0L): Long =
    if (isNull(key)) default else optLong(key, default)

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return List(length()) { optString(it, "") }.filter { it.isNotEmpty() }
}

data class Profile(
    val uid: String,
    val email: String,
    val displayName: String,
    val role: String = "student",
    val locale: String = "bn",
    val visibility: String = "public",
    val photoUrl: String? = null,
    val levelId: String? = null,
    val group: String? = null,
    val institution: String? = null,
    val blocked: Boolean = false
) {
    val isStaff: Boolean get() = role != "student"

    companion object {
        fun fromJson(j: JSONObject): Profile = Profile(
            uid = j.str("uid"),
            email = j.str("email"),
            displayName = j.str("display_name"),
            role = j.str("role", "student"),
            locale = j.str("locale", "bn"),
            visibility = j.str("profile_visibility", "public"),
            photoUrl = j.strOrNull("photo_url"),
            levelId = j.strOrNull("level_id"),
            group = j.strOrNull("grp"),
            institution = j.strOrNull("institution"),
            blocked = j.optInt("blocked", 0) == 1 || j.optBoolean("blocked", false)
        )
    }
}

data class Level(
    val id: String,
    val en: String,
    val bn: String,
    val zh: String
) {
    fun name(lang: String): String {
        val v = when (lang) {
            "bn" -> bn
            "zh" -> zh
            else -> en
        }
        return v.ifBlank { en }
    }

    companion object {
        fun fromJson(j: JSONObject): Level = Level(
            id = j.str("id"),
            en = j.str("name_en"),
            bn = j.str("name_bn"),
            zh = j.str("name_zh")
        )
    }
}

data class Subject(
    val id: String,
    val en: String,
    val bn: String,
    val zh: String,
    val icon: String,
    val color: String
) {
    fun name(lang: String): String {
        val v = when (lang) {
            "bn" -> bn
            "zh" -> zh
            else -> en
        }
        return v.ifBlank { en }
    }

    companion object {
        fun fromJson(j: JSONObject): Subject = Subject(
            id = j.str("id"),
            en = j.str("name_en"),
            bn = j.str("name_bn"),
            zh = j.str("name_zh"),
            icon = j.str("icon"),
            color = j.str("color")
        )
    }
}

data class ResourceItem(
    val id: String,
    val type: String,
    val title: String,
    val url: String?,
    val pages: Int = 0,
    val version: Int = 1,
    val sha256: String? = null,
    val sizeBytes: Long = 0L
) {
    companion object {
        fun fromJson(j: JSONObject): ResourceItem = ResourceItem(
            id = j.str("id"),
            type = j.str("type"),
            title = j.str("title"),
            url = j.strOrNull("url"),
            pages = j.intVal("pages", 0),
            version = j.intVal("version", 1),
            sha256 = j.strOrNull("sha256"),
            sizeBytes = j.longVal("sizeBytes", 0L)
        )
    }
}

data class Chapter(
    val id: String,
    val number: Int,
    val title: String,
    val hasNotes: Boolean,
    val questionCount: Int,
    val resources: List<ResourceItem>
) {
    companion object {
        fun fromJson(j: JSONObject): Chapter {
            val resArr = j.optJSONArray("resources")
            val resources = if (resArr == null) emptyList() else List(resArr.length()) {
                ResourceItem.fromJson(resArr.getJSONObject(it))
            }
            return Chapter(
                id = j.str("id"),
                number = j.intVal("number", 1),
                title = j.str("title"),
                hasNotes = j.optBoolean("hasNotes", false),
                questionCount = j.intVal("questionCount", 0),
                resources = resources
            )
        }
    }
}

data class Book(
    val id: String,
    val title: String,
    val subjectId: String,
    val edition: String,
    val author: String,
    val cover: List<String>,
    val levels: List<String>,
    val chapters: List<Chapter>,
    val featuredRank: Int? = null
) {
    companion object {
        fun fromJson(j: JSONObject): Book {
            val chArr = j.optJSONArray("chapters")
            val chapters = if (chArr == null) emptyList() else List(chArr.length()) {
                Chapter.fromJson(chArr.getJSONObject(it))
            }
            return Book(
                id = j.str("id"),
                title = j.str("title"),
                subjectId = j.str("subjectId", "others"),
                edition = j.str("edition"),
                author = j.str("author"),
                cover = j.optJSONArray("cover").toStringList(),
                levels = j.optJSONArray("levels").toStringList(),
                chapters = chapters,
                featuredRank = j.intOrNull("featuredRank")
            )
        }
    }
}

data class NoteSection(
    val heading: String,
    val text: String,
    val page: Int? = null
) {
    companion object {
        fun fromJson(j: JSONObject): NoteSection = NoteSection(
            heading = j.str("heading"),
            text = j.str("text"),
            page = j.intOrNull("page")
        )
    }
}

data class Announcement(
    val id: String,
    val title: String,
    val body: String,
    val createdAt: Long
) {
    companion object {
        fun fromJson(j: JSONObject): Announcement = Announcement(
            id = j.str("id"),
            title = j.str("title"),
            body = j.str("body"),
            createdAt = j.longVal("created_at", 0L)
        )
    }
}

data class ExamInfo(
    val id: String,
    val title: String,
    val type: String,
    val bookId: String?,
    val chapterId: String?,
    val durationSec: Int,
    val questionCount: Int,
    val passPct: Int
) {
    companion object {
        fun fromJson(j: JSONObject): ExamInfo = ExamInfo(
            id = j.str("id"),
            title = j.str("title"),
            type = j.str("type", "model"),
            bookId = j.strOrNull("book_id"),
            chapterId = j.strOrNull("chapter_id"),
            durationSec = j.intVal("duration_sec", 600),
            questionCount = j.intVal("question_count", 10),
            passPct = j.intVal("pass_pct", 60)
        )
    }
}

data class Catalog(
    val levels: List<Level>,
    val subjects: List<Subject>,
    val books: List<Book>,
    val notes: Map<String, List<NoteSection>>,
    val announcements: List<Announcement>,
    val exams: List<ExamInfo>
) {
    fun subject(id: String): Subject? = subjects.firstOrNull { it.id == id }
    fun book(id: String): Book? = books.firstOrNull { it.id == id }
    fun quizFor(chapterId: String): ExamInfo? =
        exams.firstOrNull { it.chapterId == chapterId && it.type == "chapter_quiz" }

    fun booksFor(levelId: String?): List<Book> =
        if (levelId.isNullOrBlank()) books else books.filter { it.levels.isEmpty() || it.levels.contains(levelId) }

    fun featured(levelId: String?): List<Book> =
        booksFor(levelId).filter { it.featuredRank != null }.sortedBy { it.featuredRank }

    fun modelTestsFor(levelId: String?): List<ExamInfo> {
        val ids = booksFor(levelId).map { it.id }.toSet()
        return exams.filter { it.type == "model" && (it.bookId == null || ids.contains(it.bookId)) }
    }

    fun findChapter(chapterId: String): Pair<Book, Chapter>? {
        for (b in books) {
            val ch = b.chapters.firstOrNull { it.id == chapterId }
            if (ch != null) return b to ch
        }
        return null
    }

    companion object {
        fun fromJson(j: JSONObject): Catalog {
            val levelsArr = j.optJSONArray("levels")
            val levels = if (levelsArr == null) emptyList() else List(levelsArr.length()) {
                Level.fromJson(levelsArr.getJSONObject(it))
            }
            val subArr = j.optJSONArray("subjects")
            val subjects = if (subArr == null) emptyList() else List(subArr.length()) {
                Subject.fromJson(subArr.getJSONObject(it))
            }
            val booksArr = j.optJSONArray("books")
            val books = if (booksArr == null) emptyList() else List(booksArr.length()) {
                Book.fromJson(booksArr.getJSONObject(it))
            }
            val notesMap = mutableMapOf<String, List<NoteSection>>()
            val notesObj = j.optJSONObject("notes")
            if (notesObj != null) {
                val keys = notesObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    val arr = notesObj.optJSONArray(k)
                    notesMap[k] = if (arr == null) emptyList() else List(arr.length()) {
                        NoteSection.fromJson(arr.getJSONObject(it))
                    }
                }
            }
            val annArr = j.optJSONArray("announcements")
            val announcements = if (annArr == null) emptyList() else List(annArr.length()) {
                Announcement.fromJson(annArr.getJSONObject(it))
            }
            val examArr = j.optJSONArray("exams")
            val exams = if (examArr == null) emptyList() else List(examArr.length()) {
                ExamInfo.fromJson(examArr.getJSONObject(it))
            }
            return Catalog(levels, subjects, books, notesMap, announcements, exams)
        }

        val offlineSeed: Catalog by lazy {
            Catalog(
                levels = listOf(
                    Level("c9", "Class 9", "নবম শ্রেণি", "九年级"),
                    Level("c10", "Class 10", "দশম শ্রেণি", "十年级"),
                    Level("hsc", "HSC", "এইচএসসি", "高中"),
                    Level("uni", "University", "বিশ্ববিদ্যালয়", "大学")
                ),
                subjects = listOf(
                    Subject("math", "Mathematics", "গণিত", "数学", "calc", "#3D6BFF"),
                    Subject("physics", "Physics", "পদার্থবিজ্ঞান", "物理", "atom", "#3E8092"),
                    Subject("chemistry", "Chemistry", "রসায়ন", "化学", "flask", "#D97A3E"),
                    Subject("biology", "Biology", "জীববিজ্ঞান", "生物", "leaf", "#258A5C"),
                    Subject("english", "English", "ইংরেজি", "英语", "lang", "#D95D72"),
                    Subject("ict", "ICT", "তথ্য ও যোগাযোগ প্রযুক্তি", "信息技术", "monitor", "#1A86A0"),
                    Subject("bangla", "Bangla", "বাংলা", "孟加拉语", "feather", "#B28A45")
                ),
                books = listOf(
                    Book(
                        id = "b_math_9",
                        title = "General Mathematics",
                        subjectId = "math",
                        edition = "NCTB 2026",
                        author = "Sanzar Faculty",
                        cover = listOf("#1D4ED8", "#3B82F6"),
                        levels = listOf("c9", "c10"),
                        featuredRank = 1,
                        chapters = listOf(
                            Chapter("ch_m9_1", 1, "Real Numbers", true, 10, listOf(
                                ResourceItem("res_m9_1_pdf", "pdf", "Real Numbers Summary Sheet", "https://sanzar-api.workers.dev/assets/real-numbers.pdf", 8, 1)
                            )),
                            Chapter("ch_m9_2", 2, "Sets and Functions", true, 12, emptyList())
                        )
                    ),
                    Book(
                        id = "b_phy_hsc",
                        title = "Physics First Paper",
                        subjectId = "physics",
                        edition = "HSC Core",
                        author = "Sanzar Physics Team",
                        cover = listOf("#0F766E", "#14B8A6"),
                        levels = listOf("hsc", "c10"),
                        featuredRank = 2,
                        chapters = listOf(
                            Chapter("ch_p_1", 1, "Vectors & Motion", true, 15, emptyList()),
                            Chapter("ch_p_2", 2, "Newtonian Mechanics", true, 12, emptyList())
                        )
                    ),
                    Book(
                        id = "b_ict_hsc",
                        title = "Information & Communication Technology",
                        subjectId = "ict",
                        edition = "Revised",
                        author = "Sanzar CS",
                        cover = listOf("#0369A1", "#0EA5E9"),
                        levels = listOf("hsc", "uni", "c9", "c10"),
                        featuredRank = 3,
                        chapters = listOf(
                            Chapter("ch_ict_3", 3, "Number Systems & Digital Logic", true, 10, emptyList())
                        )
                    )
                ),
                notes = mapOf(
                    "ch_m9_1" to listOf(
                        NoteSection("Classification of Real Numbers", "Real numbers include all rational numbers (integers, fractions, terminating and repeating decimals) and irrational numbers such as sqrt(2) and pi.", 1),
                        NoteSection("Properties of Operations", "Real numbers satisfy closure, commutativity, associativity, distributivity, identity, and inverse properties under addition and multiplication.", 3)
                    ),
                    "ch_p_1" to listOf(
                        NoteSection("Scalar vs Vector Quantities", "A scalar has magnitude only (mass, speed, time), whereas a vector has both magnitude and direction (displacement, velocity, force).", 2),
                        NoteSection("Vector Addition", "Resultant magnitude R = sqrt(P^2 + Q^2 + 2PQ cos(theta)). Maximum when theta = 0 deg, minimum when theta = 180 deg.", 5)
                    ),
                    "ch_ict_3" to listOf(
                        NoteSection("Binary, Octal & Hexadecimal", "Base-2 uses digits 0-1, base-8 uses 0-7 (3 bits per octal digit), and base-16 uses 0-9 and A-F (4 bits per hex digit).", 1)
                    )
                ),
                announcements = listOf(
                    Announcement("ann_1", "Welcome to Sanzar", "All textbooks, chapter notes, and model tests are available offline after sync.", System.currentTimeMillis())
                ),
                exams = listOf(
                    ExamInfo("ex_m9_1", "Real Numbers Quiz", "chapter_quiz", "b_math_9", "ch_m9_1", 600, 5, 60),
                    ExamInfo("ex_model_1", "SSC & HSC Foundation Model Test", "model", "b_ict_hsc", null, 900, 5, 60)
                )
            )
        }
    }
}

data class Achievement(
    val id: String,
    val title: String,
    val desc: String,
    val unlockedAt: Long? = null
)

data class AttemptSummary(
    val id: String,
    val examId: String,
    val title: String,
    val type: String,
    val status: String,
    val score: Int? = null,
    val total: Int? = null,
    val startedAt: Long = 0L
) {
    companion object {
        fun fromJson(j: JSONObject): AttemptSummary = AttemptSummary(
            id = j.str("id"),
            examId = j.str("examId"),
            title = j.str("title"),
            type = j.str("type"),
            status = j.str("status"),
            score = j.intOrNull("score"),
            total = j.intOrNull("total"),
            startedAt = j.longVal("startedAt", 0L)
        )
    }
}

data class ProgressData(
    val xp: Int = 0,
    val level: Int = 1,
    val levelXp: Int = 2000,
    val intoLevel: Int = 0,
    val weekXp: Int = 0,
    val todaySec: Int = 0,
    val goalSec: Int = 3600,
    val totalSec: Int = 0,
    val streak: Int = 0,
    val series: List<Pair<String, Int>> = emptyList(),
    val bySubject: List<Pair<String, Int>> = emptyList(),
    val completed: Set<String> = emptySet(),
    val achievements: List<Achievement> = emptyList(),
    val attempts: List<AttemptSummary> = emptyList()
) {
    companion object {
        fun fromJson(j: JSONObject): ProgressData {
            val seriesArr = j.optJSONArray("series")
            val series = if (seriesArr == null) emptyList() else List(seriesArr.length()) {
                val item = seriesArr.getJSONObject(it)
                item.str("day") to item.intVal("sec")
            }
            val subArr = j.optJSONArray("bySubject")
            val bySubject = if (subArr == null) emptyList() else List(subArr.length()) {
                val item = subArr.getJSONObject(it)
                item.str("subjectId") to item.intVal("sec")
            }
            val compArr = j.optJSONArray("completions")
            val completed = if (compArr == null) emptySet() else (0 until compArr.length()).map {
                compArr.getJSONObject(it).str("itemId")
            }.toSet()
            val achArr = j.optJSONArray("achievements")
            val achievements = if (achArr == null) emptyList() else List(achArr.length()) {
                val a = achArr.getJSONObject(it)
                Achievement(
                    id = a.str("id"),
                    title = a.str("title"),
                    desc = a.str("desc"),
                    unlockedAt = if (a.isNull("unlockedAt")) null else a.longVal("unlockedAt")
                )
            }
            val attArr = j.optJSONArray("attempts")
            val attempts = if (attArr == null) emptyList() else List(attArr.length()) {
                AttemptSummary.fromJson(attArr.getJSONObject(it))
            }
            return ProgressData(
                xp = j.intVal("xp"),
                level = j.intVal("level", 1),
                levelXp = j.intVal("levelXp", 2000),
                intoLevel = j.intVal("intoLevel"),
                weekXp = j.intVal("weekXp"),
                todaySec = j.intVal("todaySec"),
                goalSec = j.intVal("goalSec", 3600).coerceAtLeast(60),
                totalSec = j.intVal("totalSec"),
                streak = j.intVal("streak"),
                series = series,
                bySubject = bySubject,
                completed = completed,
                achievements = achievements,
                attempts = attempts
            )
        }
    }
}

data class TutorReference(
    val bookId: String,
    val bookTitle: String,
    val subjectId: String,
    val chapterId: String,
    val chapterTitle: String,
    val chapterNumber: Int,
    val section: Int,
    val page: Int? = null
) {
    companion object {
        fun fromJson(j: JSONObject): TutorReference = TutorReference(
            bookId = j.str("bookId"),
            bookTitle = j.str("bookTitle"),
            subjectId = j.str("subjectId"),
            chapterId = j.str("chapterId"),
            chapterTitle = j.str("chapterTitle"),
            chapterNumber = j.intVal("chapterNumber", 1),
            section = j.intVal("section", 0),
            page = j.intOrNull("page")
        )
    }
}

data class TutorAnswer(
    val found: Boolean,
    val heading: String?,
    val text: String,
    val reference: TutorReference? = null
) {
    companion object {
        fun fromJson(j: JSONObject): TutorAnswer = TutorAnswer(
            found = j.optBoolean("found", false),
            heading = j.strOrNull("heading"),
            text = j.str("text"),
            reference = j.optJSONObject("reference")?.let { TutorReference.fromJson(it) }
        )
    }
}

data class ExamQuestion(
    val id: String,
    val text: String,
    val options: List<String>,
    val answer: Int? = null,
    val chosen: Int? = null,
    val explanation: String = ""
) {
    companion object {
        fun fromJson(j: JSONObject): ExamQuestion = ExamQuestion(
            id = j.str("id"),
            text = j.str("text"),
            options = j.optJSONArray("options").toStringList(),
            answer = j.intOrNull("answer"),
            chosen = j.intOrNull("chosen"),
            explanation = j.str("explanation")
        )
    }
}

data class ExamSession(
    val attemptId: String,
    val examId: String,
    val title: String,
    val endsAt: Long,
    val serverTime: Long,
    val questions: List<ExamQuestion>
) {
    companion object {
        fun fromJson(j: JSONObject): ExamSession {
            val a = j.optJSONObject("attempt") ?: JSONObject()
            val qArr = j.optJSONArray("questions")
            val questions = if (qArr == null) emptyList() else List(qArr.length()) {
                ExamQuestion.fromJson(qArr.getJSONObject(it))
            }
            return ExamSession(
                attemptId = a.str("id"),
                examId = a.str("examId"),
                title = a.str("title"),
                endsAt = a.longVal("endsAt"),
                serverTime = a.longVal("serverTime", System.currentTimeMillis()),
                questions = questions
            )
        }
    }
}

data class AttemptResult(
    val attempt: AttemptSummary,
    val passed: Boolean,
    val passPct: Int,
    val review: List<ExamQuestion>,
    val xpAwarded: Int,
    val unlocked: List<String> = emptyList()
) {
    companion object {
        fun fromJson(j: JSONObject): AttemptResult {
            val a = j.optJSONObject("attempt") ?: JSONObject()
            val rArr = j.optJSONArray("review")
            val review = if (rArr == null) emptyList() else List(rArr.length()) {
                ExamQuestion.fromJson(rArr.getJSONObject(it))
            }
            return AttemptResult(
                attempt = AttemptSummary.fromJson(a),
                passed = a.optBoolean("passed", false),
                passPct = a.intVal("passPct", 60),
                review = review,
                xpAwarded = j.intVal("xpAwarded"),
                unlocked = j.optJSONArray("unlocked").toStringList()
            )
        }
    }
}

data class LeaderEntry(
    val rank: Int,
    val uid: String?,
    val name: String,
    val xp: Int,
    val me: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject): LeaderEntry = LeaderEntry(
            rank = j.intVal("rank"),
            uid = j.strOrNull("uid"),
            name = j.str("name"),
            xp = j.intVal("xp"),
            me = j.optBoolean("me", false)
        )
    }
}

data class PollOption(val text: String, val votes: Int)

data class Poll(
    val question: String,
    val options: List<PollOption>,
    val myVote: Int?
) {
    val total: Int get() = options.sumOf { it.votes }

    companion object {
        fun fromJson(j: JSONObject): Poll {
            val arr = j.optJSONArray("options")
            val opts = if (arr == null) emptyList() else List(arr.length()) {
                val o = arr.getJSONObject(it)
                PollOption(o.str("text"), o.intVal("votes"))
            }
            return Poll(
                question = j.str("question"),
                options = opts,
                myVote = j.intOrNull("myVote")
            )
        }
    }
}

data class PostAttachment(
    val key: String? = null,
    val url: String? = null,
    val name: String,
    val mime: String
) {
    fun toJson(): JSONObject = JSONObject().apply {
        if (key != null) put("key", key)
        if (url != null) put("url", url)
        put("name", name)
        put("mime", mime)
    }

    companion object {
        fun fromJson(j: JSONObject): PostAttachment = PostAttachment(
            key = j.strOrNull("key"),
            url = j.strOrNull("url"),
            name = j.str("name", "Attachment"),
            mime = j.str("mime", "application/octet-stream")
        )
    }
}

data class Post(
    val id: String,
    val authorUid: String,
    val authorName: String,
    val text: String,
    val category: String,
    val likeCount: Int,
    val commentCount: Int,
    val createdAt: Long,
    val likedByMe: Boolean,
    val mine: Boolean,
    val poll: Poll? = null,
    val attachments: List<PostAttachment> = emptyList()
) {
    companion object {
        fun fromJson(j: JSONObject): Post {
            val attArr = j.optJSONArray("attachments")
            val atts = if (attArr == null) emptyList() else List(attArr.length()) {
                PostAttachment.fromJson(attArr.getJSONObject(it))
            }
            return Post(
                id = j.str("id"),
                authorUid = j.str("authorUid"),
                authorName = j.str("authorName"),
                text = j.str("text"),
                category = j.str("category", "general"),
                likeCount = j.intVal("likeCount"),
                commentCount = j.intVal("commentCount"),
                createdAt = j.longVal("createdAt"),
                likedByMe = j.optBoolean("likedByMe", false),
                mine = j.optBoolean("mine", false),
                poll = j.optJSONObject("poll")?.let { Poll.fromJson(it) },
                attachments = atts
            )
        }
    }
}

data class Comment(
    val id: String,
    val authorUid: String,
    val authorName: String,
    val text: String,
    val createdAt: Long,
    val mine: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject): Comment = Comment(
            id = j.str("id"),
            authorUid = j.str("authorUid"),
            authorName = j.str("authorName"),
            text = j.str("text"),
            createdAt = j.longVal("createdAt"),
            mine = j.optBoolean("mine", false)
        )
    }
}

data class AppNotification(
    val id: String,
    val title: String,
    val body: String,
    val read: Boolean,
    val createdAt: Long
) {
    companion object {
        fun fromJson(j: JSONObject): AppNotification = AppNotification(
            id = j.str("id"),
            title = j.str("title"),
            body = j.str("body"),
            read = j.optBoolean("read", false),
            createdAt = j.longVal("createdAt")
        )
    }
}

data class PublicProfile(
    val uid: String,
    val name: String,
    val visibility: String,
    val levelId: String?,
    val institution: String?,
    val xp: Int?,
    val followers: Int,
    val following: Int,
    val isFollowing: Boolean,
    val limited: Boolean
)

data class ResourceManifestItem(
    val resourceId: String,
    val version: Int,
    val url: String,
    val sha256: String,
    val sizeBytes: Long,
    val title: String = ""
) {
    companion object {
        fun fromJson(j: JSONObject): ResourceManifestItem = ResourceManifestItem(
            resourceId = j.str("resourceId", j.str("id")),
            version = j.intVal("version", 1),
            url = j.str("url"),
            sha256 = j.str("sha256"),
            sizeBytes = j.longVal("sizeBytes"),
            title = j.str("title")
        )
    }
}
