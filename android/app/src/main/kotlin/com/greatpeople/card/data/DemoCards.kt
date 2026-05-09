package com.greatpeople.card.data

import android.content.Context
import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import org.json.JSONArray

fun loadDemoCards(context: Context): List<Card> {
    val json = context.assets.open("demo_cards.json").bufferedReader().use { it.readText() }
    val arr = JSONArray(json)
    return (0 until arr.length()).map { i ->
        val obj = arr.getJSONObject(i)
        val key = obj.getString("portraitKey")
        val identitiesArr = obj.getJSONArray("identities")
        Card(
            id = obj.getString("id"),
            figureName = obj.getString("figureName"),
            era = obj.getString("era"),
            gender = obj.getString("gender"),
            identities = (0 until identitiesArr.length()).map { identitiesArr.getString(it) },
            tier = CardTier.valueOf(obj.getString("tier").uppercase()),
            lore = obj.getString("lore"),
            portraitUrl = "file:///android_asset/portraits/portrait_$key.jpeg",
            years = obj.getString("years"),
            characteristics = obj.getString("characteristics"),
            achievement = obj.getString("achievement"),
            politics = obj.getInt("politics"),
            strength = obj.getInt("strength"),
            culture = obj.getInt("culture"),
            wealth = obj.getInt("wealth"),
            intelligence = obj.getInt("intelligence"),
            technique = obj.getInt("technique"),
            belief = obj.getInt("belief"),
            reputation = obj.getInt("reputation"),
        )
    }
}
