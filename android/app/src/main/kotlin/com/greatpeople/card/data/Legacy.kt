package com.greatpeople.card.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * A card's legacy in the Fight game, read from the bundled cards.json: what
 * it does and the card's own achievement that earns it.  Kept apart from the
 * Room-backed Card so the card table needs no migration.
 */
data class LegacyInfo(val name: String, val effect: String, val howToEarn: String, val flavour: String)

private var cache: Map<String, LegacyInfo>? = null

fun loadLegacy(context: Context, cardId: String): LegacyInfo? {
    val all = cache ?: run {
        val arr = JSONArray(context.assets.open("cards.json").bufferedReader().use { it.readText() })
        (0 until arr.length()).mapNotNull { i ->
            val obj = arr.getJSONObject(i)
            val legacy = obj.optJSONObject("legacy") ?: return@mapNotNull null
            val achievement = obj.optString("achievement")
            obj.getString("id") to LegacyInfo(
                name = legacy.optString("name"),
                effect = describeLegacyEffect(legacy.optJSONObject("effect") ?: JSONObject()),
                howToEarn = achievement.substringAfter(" — ", achievement),
                flavour = legacy.optString("flavour"),
            )
        }.toMap().also { cache = it }
    }
    return all[cardId]
}

private val STAT_LABELS = mapOf(
    "politics" to "Politics", "strength" to "Strength", "culture" to "Culture", "wealth" to "Wealth",
    "intelligence" to "Intelligence", "technique" to "Technique", "belief" to "Belief", "reputation" to "Reputation",
)
private val CONTEXT_WORDS = mapOf(
    "attack" to "when you attack", "defend" to "when you defend",
    "survival" to "in survival checks (survivals and hazards)",
    "competition" to "in global competitions", "any" to "in every contest",
)

/** Plain-language rule text for a legacy effect; mirrors describeLegacyEffect in web/src/battle/engine.ts. */
fun describeLegacyEffect(e: JSONObject): String {
    val stat = e.optString("stat")
    val statLabel = STAT_LABELS[stat]
    return when (e.optString("kind")) {
        "contest" -> "+${e.optInt("amount")} ${if (stat == "any") "to your total" else statLabel} ${CONTEXT_WORDS[e.optString("context")] ?: ""}."
        "follower" -> "Each of your ${if (stat == "any") "" else "$statLabel "}Followers that counts in a contest adds +${e.optInt("amount")} more."
        "hazard_shield" -> "Your cards ignore natural hazards."
        "longevity" -> "Your Great People live ${e.optInt("years")} years longer."
        "prodigy" -> "Your Great People start their careers ${e.optInt("years")} years earlier."
        "successors" -> "+${e.optInt("count")} choice whenever you pick a successor."
        "slots" -> e.optInt("count").let { n -> "+$n Great Person slot: hold ${if (n == 1) "one more Great Person" else "$n more Great People"} at once." }
        "locations" -> e.optInt("count").let { n -> "+$n ${if (n == 1) "city" else "cities"} on the board for every player while this legacy is in effect." }
        "income" -> "Every ${e.optInt("every")} years you gain ${if (e.optString("card") == "event") "an Event card" else "a Follower"}."
        else -> ""
    }
}
