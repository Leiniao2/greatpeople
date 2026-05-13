package com.greatpeople.card.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

enum class ChallengeType { quiz, truefalse, sort, minigame }

data class ChallengeDTO(
    val type: ChallengeType,
    val question: String?,
    val options: List<String>?,
    val answer: Int?,
    val statement: String?,
    val correct: Boolean?,
    val items: List<String>?,
    val fact: String,
    val game: String?,
    val instruction: String?,
)

data class StoryChallengeEntry(
    val era: String,
    val story: String,
    val challenges: List<ChallengeDTO>,
)

object StoryChallengesLoader {
    private var loaded: List<StoryChallengeEntry>? = null

    fun load(context: Context): List<StoryChallengeEntry> {
        loaded?.let { return it }
        val json = context.assets.open("story_challenges.json").bufferedReader().readText()
        val arr = JSONArray(json)
        val result = (0 until arr.length()).map { i ->
            val entry = arr.getJSONObject(i)
            val challengesArr = entry.getJSONArray("challenges")
            StoryChallengeEntry(
                era = entry.getString("era"),
                story = entry.getString("story"),
                challenges = (0 until challengesArr.length())
                    .map { j -> parseChallenge(challengesArr.getJSONObject(j)) }
            )
        }
        loaded = result
        return result
    }

    private fun parseChallenge(obj: JSONObject): ChallengeDTO {
        val typeStr = obj.getString("type")
        val type = ChallengeType.entries.find { it.name == typeStr } ?: ChallengeType.minigame
        val optionsArr = if (obj.has("options")) obj.getJSONArray("options") else null
        return ChallengeDTO(
            type = type,
            question = if (obj.has("question")) obj.getString("question") else null,
            options = optionsArr?.let { arr -> (0 until arr.length()).map { arr.getString(it) } },
            answer = if (obj.has("answer")) obj.getInt("answer") else null,
            statement = if (obj.has("statement")) obj.getString("statement") else null,
            correct = if (obj.has("correct")) obj.getBoolean("correct") else null,
            items = if (obj.has("items")) {
                val a = obj.getJSONArray("items"); (0 until a.length()).map { a.getString(it) }
            } else null,
            fact = if (obj.has("fact")) obj.getString("fact") else "",
            game = if (obj.has("game")) obj.getString("game") else null,
            instruction = if (obj.has("instruction")) obj.getString("instruction") else null,
        )
    }

    fun getChallenges(context: Context, era: String, story: String): List<ChallengeDTO> =
        load(context).find { it.era == era && it.story == story }?.challenges ?: emptyList()
}
