local M = {}

local function to_number(value, fallback)
    local parsed = tonumber(value)

    if parsed == nil then
        return fallback or 0
    end

    return parsed
end

local function format_minutes(value)
    local minutes = tonumber(value)

    if minutes == nil or minutes <= 0 then
        return nil
    end

    minutes = math.floor(minutes + 0.5)

    local hours = math.floor(minutes / 60)
    local mins = minutes % 60

    if hours <= 0 then
        return tostring(mins) .. "m"
    end

    if mins == 0 then
        return tostring(hours) .. "h"
    end

    return tostring(hours) .. "h " .. tostring(mins) .. "m"
end

local function format_percent_of_starters(perfected, started)
    local p = tonumber(perfected)
    local s = tonumber(started)

    if p == nil or s == nil or s <= 0 then
        return nil
    end

    return string.format("%.1f%% of starters", (p / s) * 100)
end

local function add_item(items, label, value, kind)
    if value == nil then
        return
    end

    if tostring(value) == "" then
        return
    end

    table.insert(items, {
        label = label,
        value = tostring(value),
        kind = kind or "metric"
    })
end

local function add_count_if_positive(items, label, value, kind)
    local count = to_number(value, 0)

    if count <= 0 then
        return
    end

    add_item(items, label, tostring(count), kind)
end

function M.error_response(app_id, page_kind, error_message, encode_json)
    return encode_json({
        ok = false,
        show_panel = true,
        type = "completion_context",
        source = "steamhunters",
        app_id = to_number(app_id, 0),
        page_kind = tostring(page_kind or "unknown"),
        title = "Steam Completion Companion",
        summary = "SteamHunters lookup failed: " .. tostring(error_message),
        restricted_count = 0,
        items = {
            {
                label = "Error",
                value = tostring(error_message),
                kind = "error"
            }
        }
    })
end

function M.no_app_response(page_kind, encode_json)
    return encode_json({
        ok = true,
        show_panel = false,
        type = "completion_context",
        source = "steamhunters",
        has_app = false,
        page_kind = tostring(page_kind or "unknown"),
        title = "Steam Completion Companion",
        summary = "",
        restricted_count = 0,
        items = {}
    })
end

function M.hidden_response(app, page_kind, encode_json)
    return encode_json({
        ok = true,
        show_panel = false,
        type = "completion_context",
        source = "steamhunters",
        has_app = true,
        app_id = app.app_id,
        page_kind = tostring(page_kind or "unknown"),
        title = "Steam Completion Companion",
        summary = "",
        restricted_count = 0,
        items = {}
    })
end

function M.app_response(app, achievements, page_kind, app_from_cache, achievements_from_cache, achievements_error, encode_json, log)
    if app.type_string ~= "Game" then
        log("hiding panel for non-game app type: " .. tostring(app.type_string))
        return M.hidden_response(app, page_kind, encode_json)
    end

    if to_number(app.achievement_count, 0) <= 0 then
        log("hiding panel for game without achievements: " .. tostring(app.app_id))
        return M.hidden_response(app, page_kind, encode_json)
    end

    local broken_but_obtainable = 0
    local conditionally_obtainable = 0
    local unobtainable = 0

    if achievements ~= nil then
        broken_but_obtainable = to_number(achievements.broken_but_obtainable, 0)
        conditionally_obtainable = to_number(achievements.conditionally_obtainable, 0)
        unobtainable = to_number(achievements.unobtainable, 0)
    end

    local items = {}

    add_item(items, "Median completion", format_minutes(app.median_completion_time), "median_completion")
    add_item(items, "Players perfected", tostring(to_number(app.players_perfected_count, 0)), "players_perfected")
    add_item(
        items,
        "Perfected by starters",
        format_percent_of_starters(app.players_perfected_count, app.players_started_count),
        "perfected_by_starters"
    )

    if app.has_paid_dlc == true then
        add_item(items, "Paid DLC", "Yes", "paid_dlc")
    end

    if app.is_restricted == true then
        add_item(items, "Restricted", "Yes", "restricted")
    end

    if app.is_removed == true then
        add_item(items, "Removed", "Yes", "removed")
    end

    add_count_if_positive(items, "Broken but obtainable", broken_but_obtainable, "broken")
    add_count_if_positive(items, "Conditionally obtainable", conditionally_obtainable, "conditional")
    add_count_if_positive(items, "Unobtainable", unobtainable, "unobtainable")

    if achievements_error ~= nil then
        add_item(items, "Achievement detail error", achievements_error, "error")
    end

    return encode_json({
        ok = true,
        show_panel = true,
        type = "completion_context",
        source = "steamhunters",
        has_app = true,
        app_id = app.app_id,
        page_kind = tostring(page_kind or "unknown"),
        title = "Steam Completion Companion",
        summary = "",
        restricted_count = unobtainable,
        steam_hunters_url = "https://steamhunters.com/apps/" .. tostring(app.app_id),
        items = items,
        debug = {
            app_cache = app_from_cache and true or false,
            achievements_cache = achievements_from_cache and true or false
        }
    })
end

return M