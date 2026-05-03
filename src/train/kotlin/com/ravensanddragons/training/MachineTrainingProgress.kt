package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import java.io.Flushable

fun interface TrainingProgressListener {
    fun report(completed: Int, total: Int)
}

class DecileProgressLine(
    private val output: Appendable,
    private val label: String
) {
    private var nextDecile = 0

    fun start() {
        output.appendLine("$label:")
        writeNextDecile()
    }

    fun update(completed: Int, total: Int) {
        require(total > 0) {
            "Progress total must be positive."
        }
        require(completed in 0..total) {
            "Progress completed count must be between zero and total."
        }

        val percentComplete = ((completed.toLong() * 100) / total).toInt()
        while (nextDecile <= percentComplete && nextDecile <= 100) {
            writeNextDecile()
        }
    }

    fun finish() {
        update(completed = 1, total = 1)
        output.appendLine()
        flush()
    }

    private fun writeNextDecile() {
        if (nextDecile > 0) {
            output.append("..")
        }
        output.append(nextDecile.toString())
        output.append('%')
        nextDecile += 10
        flush()
    }

    private fun flush() {
        if (output is Flushable) {
            output.flush()
        }
    }
}
