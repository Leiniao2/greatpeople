package com.greatpeople.card.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.greatpeople.card.data.ChallengeDTO
import com.greatpeople.card.data.ChallengeType
import com.greatpeople.card.data.StoryChallengesLoader

private val Amber = Color(0xFFF59E0B)
private val BgDark = Color(0xFF0F0F1E)
private val Green = Color(0xFF4ADE80)
private val Red = Color(0xFFF87171)
private val Slate400 = Color(0xFF94A3B8)
private val Slate600 = Color(0xFF475569)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun StorySheet(
    eraName: String,
    storyTitle: String,
    onComplete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val challenges = remember(eraName, storyTitle) {
        StoryChallengesLoader.getChallenges(context, eraName, storyTitle)
    }
    val total = challenges.size
    val scoreableCount = challenges.count { it.type != ChallengeType.minigame }

    var idx by remember { mutableIntStateOf(0) }
    var answered by remember { mutableStateOf(false) }
    var lastCorrect by remember { mutableStateOf(false) }
    var score by remember { mutableIntStateOf(0) }
    var finished by remember { mutableStateOf(false) }

    val advance = {
        if (idx + 1 >= total) {
            finished = true
        } else {
            idx++
            answered = false
            lastCorrect = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = BgDark,
        contentColor = Color.White,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        if (total == 0) {
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text("No challenges yet.", color = Slate400)
            }
            return@ModalBottomSheet
        }

        if (finished) {
            ResultsView(storyTitle, score, scoreableCount, onComplete = { onComplete(); onDismiss() })
            return@ModalBottomSheet
        }

        val ch = challenges[idx]
        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(eraName, color = Amber.copy(alpha = 0.7f), fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
                        Text(storyTitle, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${idx + 1} / $total", color = Slate400, fontSize = 12.sp)
                        IconButton(onClick = onDismiss) {
                            Text("✕", color = Slate400, fontSize = 16.sp)
                        }
                    }
                }
            }

            item {
                // Progress bar
                LinearProgressIndicator(
                    progress = { idx.toFloat() / total },
                    modifier = Modifier.fillMaxWidth().height(4.dp),
                    color = Amber,
                    trackColor = Color.White.copy(alpha = 0.06f),
                )
            }

            item {
                when (ch.type) {
                    ChallengeType.quiz -> QuizChallenge(ch, answered) { correct ->
                        lastCorrect = correct; answered = true; if (correct) score++
                    }
                    ChallengeType.truefalse -> TrueFalseChallenge(ch, answered) { correct ->
                        lastCorrect = correct; answered = true; if (correct) score++
                    }
                    ChallengeType.sort -> SortChallenge(ch, answered) { correct ->
                        lastCorrect = correct; answered = true; if (correct) score++
                    }
                    ChallengeType.minigame -> DiscoveryCard(ch, answered) {
                        lastCorrect = true; answered = true
                    }
                }
            }

            if (answered) {
                if (ch.type != ChallengeType.minigame) {
                    item {
                        FactBanner(ch.fact, lastCorrect)
                    }
                }
                item {
                    Button(
                        onClick = { advance() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Amber),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            if (idx + 1 < total) "Next →" else "See Results →",
                            color = BgDark,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

@Composable
private fun QuizChallenge(ch: ChallengeDTO, answered: Boolean, onAnswer: (Boolean) -> Unit) {
    var selected by remember { mutableIntStateOf(-1) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(ch.question ?: "", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        ch.options?.forEachIndexed { i, opt ->
            val isCorrect = i == ch.answer
            val isSelected = i == selected
            val bg = when {
                !answered -> Color.White.copy(alpha = 0.05f)
                isCorrect -> Green.copy(alpha = 0.15f)
                isSelected -> Red.copy(alpha = 0.15f)
                else -> Color.White.copy(alpha = 0.02f)
            }
            val border = when {
                !answered -> Color.White.copy(alpha = 0.1f)
                isCorrect -> Green.copy(alpha = 0.5f)
                isSelected -> Red.copy(alpha = 0.4f)
                else -> Color.White.copy(alpha = 0.04f)
            }
            val textColor = when {
                !answered -> Color.White.copy(alpha = 0.85f)
                isCorrect -> Green
                isSelected -> Red
                else -> Color.White.copy(alpha = 0.3f)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(bg, RoundedCornerShape(12.dp))
                    .border(1.dp, border, RoundedCornerShape(12.dp))
                    .clickable(enabled = !answered) {
                        selected = i
                        onAnswer(i == ch.answer)
                    }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Text(opt, color = textColor, fontSize = 14.sp)
            }
        }
    }
}

// ── True / False ─────────────────────────────────────────────────────────────

@Composable
private fun TrueFalseChallenge(ch: ChallengeDTO, answered: Boolean, onAnswer: (Boolean) -> Unit) {
    var choice by remember { mutableStateOf<Boolean?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(ch.statement ?: "", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(true, false).forEach { c ->
                val isCorrect = c == ch.correct
                val isSelected = c == choice
                val bg = when {
                    !answered -> Color.White.copy(alpha = 0.05f)
                    isCorrect -> Green.copy(alpha = 0.15f)
                    isSelected -> Red.copy(alpha = 0.15f)
                    else -> Color.White.copy(alpha = 0.02f)
                }
                val border = when {
                    !answered -> Color.White.copy(alpha = 0.1f)
                    isCorrect -> Green.copy(alpha = 0.5f)
                    isSelected -> Red.copy(alpha = 0.4f)
                    else -> Color.White.copy(alpha = 0.04f)
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .background(bg, RoundedCornerShape(12.dp))
                        .border(1.dp, border, RoundedCornerShape(12.dp))
                        .clickable(enabled = !answered) {
                            choice = c
                            onAnswer(c == ch.correct)
                        }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (c) "True" else "False",
                        color = when {
                            !answered -> Color.White
                            isCorrect -> Green
                            isSelected -> Red
                            else -> Color.White.copy(0.3f)
                        },
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

// ── Sort ─────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SortChallenge(ch: ChallengeDTO, answered: Boolean, onAnswer: (Boolean) -> Unit) {
    val items = remember { ch.items?.shuffled() ?: emptyList() }
    val selected = remember { mutableStateListOf<String>() }
    var submitted by remember { mutableStateOf(false) }
    val remaining = items.filter { !selected.contains(it) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(ch.question ?: "Arrange in correct order:", color = Color.White,
            fontWeight = FontWeight.SemiBold, fontSize = 14.sp)

        // Answer area
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(12.dp))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (selected.isEmpty()) {
                Text("Tap items below in order…", color = Slate600, fontSize = 12.sp, fontStyle = FontStyle.Italic)
            } else {
                selected.forEachIndexed { i, item ->
                    val correctItems = ch.items ?: emptyList()
                    val isCorrect = submitted && i < correctItems.size && item == correctItems[i]
                    val isWrong = submitted && (i >= correctItems.size || item != correctItems[i])
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                when { isCorrect -> Green.copy(0.15f); isWrong -> Red.copy(0.15f); else -> Amber.copy(0.1f) },
                                RoundedCornerShape(8.dp)
                            )
                            .border(1.dp,
                                when { isCorrect -> Green.copy(0.4f); isWrong -> Red.copy(0.35f); else -> Amber.copy(0.25f) },
                                RoundedCornerShape(8.dp))
                            .clickable(enabled = !submitted) { selected.remove(item) }
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("${i + 1}. ", color = Slate400, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(item,
                            color = when { isCorrect -> Green; isWrong -> Red; else -> Amber },
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        // Remaining chips
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            remaining.forEach { item ->
                Box(
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                        .clickable(enabled = !submitted) { selected.add(item) }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    Text(item, color = Color.White.copy(0.8f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        if (selected.size == (ch.items?.size ?: 0) && !submitted) {
            Button(
                onClick = {
                    submitted = true
                    val correct = selected.toList() == (ch.items ?: emptyList<String>())
                    onAnswer(correct)
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Amber),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Check Order", color = BgDark, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ── Discovery card (minigame fallback) ───────────────────────────────────────

@Composable
private fun DiscoveryCard(ch: ChallengeDTO, revealed: Boolean, onReveal: () -> Unit) {
    val gameLabel = when (ch.game) {
        "crossword"    -> "Word Puzzle"
        "maze3d"       -> "Navigation Challenge"
        "geometry"     -> "Geometry Challenge"
        "painting"     -> "Creative Challenge"
        "tactics"      -> "Tactics Puzzle"
        "matchthree"   -> "Market Challenge"
        "chemistry"    -> "Chemistry Lab"
        "sudoku"       -> "Logic Puzzle"
        "voting"       -> "Voting Strategy"
        "fiction"      -> "Story Choice"
        else           -> "Challenge"
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Game type badge
        Text(
            "✦ $gameLabel",
            color = Amber,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
        )
        // Instruction
        Text(
            ch.instruction ?: ch.question ?: "Discover more about this story.",
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
        )
        if (!revealed) {
            Button(
                onClick = onReveal,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Amber.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Reveal Discovery →", color = Amber, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        } else {
            // Fact revealed
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Amber.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
                    .border(1.dp, Amber.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("✦ Discovery", color = Amber, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(ch.fact, color = Slate400, fontSize = 12.sp)
            }
        }
    }
}

// ── Fact banner ───────────────────────────────────────────────────────────────

@Composable
private fun FactBanner(fact: String, correct: Boolean) {
    val color = if (correct) Green else Red
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
            .border(1.dp, color.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            if (correct) "✓ Correct!" else "✗ Not quite.",
            color = color,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
        )
        Text(fact, color = Slate400, fontSize = 12.sp)
    }
}

// ── Results ───────────────────────────────────────────────────────────────────

@Composable
private fun ResultsView(storyTitle: String, score: Int, total: Int, onComplete: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(if (score == total) "🏆" else if (score >= total / 2) "⭐" else "📖", fontSize = 48.sp)
        Text(storyTitle, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text("$score / $total correct", color = Amber, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
        Text(
            if (score == total) "Perfect score! Story complete." else "Story complete! Keep exploring.",
            color = Slate400,
            fontSize = 14.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Button(
            onClick = onComplete,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Amber),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text("Complete Story →", color = BgDark, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Spacer(Modifier.height(16.dp))
    }
}
