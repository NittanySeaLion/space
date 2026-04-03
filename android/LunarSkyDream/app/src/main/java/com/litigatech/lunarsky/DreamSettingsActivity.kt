package com.litigatech.lunarsky

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Spinner
import android.widget.TextView
import com.litigatech.lunarsky.LunarSkyDreamService.Companion.PREF_LOCATION
import com.litigatech.lunarsky.LunarSkyDreamService.Companion.PREFS_NAME

class DreamSettingsActivity : Activity() {

    private val locationKeys  = arrayOf("orientale", "shackleton", "tranquility")
    private val locationLabels = arrayOf(
        "Mare Orientale — Western Limb",
        "Shackleton Crater — South Pole  (Artemis III site)",
        "Tranquility Base — Apollo 11 landing site"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_dream_settings)

        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val current = prefs.getString(PREF_LOCATION, "shackleton") ?: "shackleton"

        val spinner = findViewById<Spinner>(R.id.locationSpinner)
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, locationLabels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter
        spinner.setSelection(locationKeys.indexOf(current).coerceAtLeast(0))

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: View?, pos: Int, id: Long) {
                prefs.edit().putString(PREF_LOCATION, locationKeys[pos]).apply()
            }
            override fun onNothingSelected(parent: AdapterView<*>) {}
        }
    }
}
