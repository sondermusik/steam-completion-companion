local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local json = require("json")

local NS = "[SCC]"

local CACHE_TTL_SECONDS = 60 * 30

local app_cache = {}
local achievements_cache = {}

local DEFAULT_HEADERS = {
    ["Accept"] = "application/json",
    ["X-Requested-With"] = "Steam",
    ["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36"
}

local function log(message)
    logger:info(NS .. " " .. tostring(message))
    print(NS .. " " .. tostring(message))
end

local function now()
    return os.time()
end

local function to_number(value, fallback)
    local parsed = tonumber(value)

    if parsed == nil then
        return fallback or 0
    end

    return parsed
end

local function to_boolean(value)
    if value == true then
        return true
    end

    if value == false then
        return false
    end

    return nil
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

local function format_rating(value)
    local rating = tonumber(value)

    if rating == nil then
        return nil
    end

    return string.format("%.1f%%", rating)
end

local function format_percent_of_starters(perfected, started)
    local p = tonumber(perfected)
    local s = tonumber(started)

    if p == nil or s == nil or s <= 0 then
        return nil
    end

    return string.format("%.1f%% of starters", (p / s) * 100)
end

local function decode_json(text)
    if type(text) ~= "string" or text == "" then
        return nil, "empty JSON string"
    end

    local ok, decoded = pcall(json.decode, text)

    if not ok then
        return nil, "JSON decode failed: " .. tostring(decoded)
    end

    if decoded == nil then
        return nil, "JSON decode returned nil"
    end

    return decoded, nil
end

local function encode_json(value)
    local ok, encoded = pcall(json.encode, value)

    if not ok then
        log("json.encode failed: " .. tostring(encoded))
        return "{\"ok\":false,\"type\":\"error\",\"error\":\"json encode failed\"}"
    end

    return encoded
end

local function get_cache(cache_table, app_id)
    local key = tostring(app_id)
    local entry = cache_table[key]

    if entry == nil then
        return nil
    end

    if now() - entry.time > CACHE_TTL_SECONDS then
        cache_table[key] = nil
        return nil
    end

    return entry.data
end

local function set_cache(cache_table, app_id, data)
    cache_table[tostring(app_id)] = {
        time = now(),
        data = data
    }
end

local function request_json(url)
    log("request_json: " .. tostring(url))

    local response, err = http.get(url, {
        headers = DEFAULT_HEADERS,
        timeout = 20
    })

    if response == nil then
        return nil, "request failed: " .. tostring(err or "no response")
    end

    if response.status ~= 200 then
        return nil, "HTTP " .. tostring(response.status) .. ": " .. tostring(response.body or "")
    end

    if response.body == nil or response.body == "" then
        return nil, "empty response body"
    end

    local decoded, decode_err = decode_json(response.body)

    if decode_err ~= nil then
        return nil, decode_err
    end

    return decoded, nil
end

local function fetch_steamhunters_app(app_id)
    local cached = get_cache(app_cache, app_id)

    if cached ~= nil then
        return cached, nil, true
    end

    local url = "https://steamhunters.com/api/apps/" .. tostring(app_id)
    local data, err = request_json(url)

    if err ~= nil then
        return nil, err, false
    end

    if data.appId == nil then
        return nil, "invalid app summary response, missing appId", false
    end

    local app = {
        app_id = to_number(data.appId, app_id),
        name = tostring(data.name or "Unknown game"),
        type = to_number(data.type, 0),
        type_string = tostring(data.typeString or ""),
        achievement_count = to_number(data.achievementCount, 0),
        median_completion_time = data.medianCompletionTime,
        fastest_completion_time = data.fastestCompletionTime,
        steam_db_rating = data.steamDbRating,
        players_perfected_count = to_number(data.playersPerfectedCount, 0),
        players_started_count = to_number(data.playersStartedCount, 0),
        has_paid_dlc = to_boolean(data.hasPaidDlc),
        is_restricted = to_boolean(data.isRestricted),
        is_removed = to_boolean(data.isRemoved),
        is_free = to_boolean(data.isFree)
    }

    set_cache(app_cache, app_id, app)

    return app, nil, false
end

local function count_achievement_obtainability(achievements)
    local result = {
        total = 0,
        obtainable = 0,
        broken_but_obtainable = 0,
        conditionally_obtainable = 0,
        unobtainable = 0
    }

    if type(achievements) ~= "table" then
        return result
    end

    for _, achievement in ipairs(achievements) do
        if type(achievement) == "table" then
            result.total = result.total + 1

            local obtainability = to_number(achievement.obtainability, -1)

            if obtainability == 0 then
                result.obtainable = result.obtainable + 1
            elseif obtainability == 1 then
                result.broken_but_obtainable = result.broken_but_obtainable + 1
            elseif obtainability == 2 then
                result.conditionally_obtainable = result.conditionally_obtainable + 1
            elseif obtainability == 3 then
                result.unobtainable = result.unobtainable + 1
            end
        end
    end

    return result
end

local function fetch_steamhunters_achievements(app_id)
    local cached = get_cache(achievements_cache, app_id)

    if cached ~= nil then
        return cached, nil, true
    end

    local url = "https://steamhunters.com/api/apps/" .. tostring(app_id) .. "/achievements"
    local data, err = request_json(url)

    if err ~= nil then
        return nil, err, false
    end

    local counts = count_achievement_obtainability(data)

    set_cache(achievements_cache, app_id, counts)

    return counts, nil, false
end

local function add_item(items, label, value)
    if value == nil then
        return
    end

    if tostring(value) == "" then
        return
    end

    table.insert(items, {
        label = label,
        value = tostring(value)
    })
end

local function add_count_if_positive(items, label, value)
    local count = to_number(value, 0)

    if count <= 0 then
        return
    end

    add_item(items, label, tostring(count))
end

local function make_error_response(app_id, page_kind, error_message)
    return encode_json({
        ok = false,
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
                value = tostring(error_message)
            }
        }
    })
end

local function make_no_app_response(page_kind)
    return encode_json({
        ok = true,
        type = "completion_context",
        source = "steamhunters",
        has_app = false,
        page_kind = tostring(page_kind or "unknown"),
        title = "Steam Completion Companion",
        summary = "No app id detected on this page.",
        restricted_count = 0,
        items = {}
    })
end

local function make_hidden_response(app, page_kind)
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

local function make_app_response(app, achievements, page_kind, app_from_cache, achievements_from_cache, achievements_error)
    if app.type_string ~= "Game" then
        log("hiding panel for non-game app type: " .. tostring(app.type_string))
        return make_hidden_response(app, page_kind)
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

    add_item(items, "Median completion", format_minutes(app.median_completion_time))
    add_item(items, "SteamDB rating", format_rating(app.steam_db_rating))

    add_item(items, "Players perfected", tostring(to_number(app.players_perfected_count, 0)))
    add_item(
        items,
        "Perfected by starters",
        format_percent_of_starters(app.players_perfected_count, app.players_started_count)
    )

    if app.has_paid_dlc == true then
        add_item(items, "Paid DLC", "Yes")
    end

    if app.is_restricted == true then
        add_item(items, "Restricted", "Yes")
    end

    add_count_if_positive(items, "Broken but obtainable", broken_but_obtainable)
    add_count_if_positive(items, "Conditionally obtainable", conditionally_obtainable)
    add_count_if_positive(items, "Unobtainable", unobtainable)

    if achievements_error ~= nil then
        add_item(items, "Achievement detail error", achievements_error)
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
        items = items,
        debug = {
            app_cache = app_from_cache and true or false,
            achievements_cache = achievements_from_cache and true or false
        }
    })
end

function shc_json_bridge(payload_json)
    log("shc_json_bridge called")
    log("payload_json type: " .. type(payload_json))
    log("payload_json value: " .. tostring(payload_json))

    if type(payload_json) ~= "string" then
        return make_error_response(0, "unknown", "expected JSON string, got " .. type(payload_json))
    end

    local payload, payload_err = decode_json(payload_json)

    if payload_err ~= nil then
        return make_error_response(0, "unknown", payload_err)
    end

    local request_type = tostring(payload.type or "")
    local source = tostring(payload.source or "")
    local page_kind = tostring(payload.page_kind or "unknown")
    local app_id = to_number(payload.app_id, 0)
    local href = tostring(payload.href or "")

    log("request_type: " .. request_type)
    log("source: " .. source)
    log("page_kind: " .. page_kind)
    log("app_id: " .. tostring(app_id))
    log("href: " .. href)

    if app_id <= 0 then
        return make_no_app_response(page_kind)
    end

    local app, app_err, app_from_cache = fetch_steamhunters_app(app_id)

    if app_err ~= nil then
        log("SteamHunters app summary error: " .. tostring(app_err))
        return make_error_response(app_id, page_kind, app_err)
    end

    local achievements, achievements_err, achievements_from_cache = fetch_steamhunters_achievements(app_id)

    if achievements_err ~= nil then
        log("SteamHunters achievements error: " .. tostring(achievements_err))
    end

    return make_app_response(
        app,
        achievements,
        page_kind,
        app_from_cache,
        achievements_from_cache,
        achievements_err
    )
end

local function on_load()
    log("backend on_load")
    millennium.ready()
end

local function on_frontend_loaded()
    log("frontend loaded")
end

local function on_unload()
    log("backend on_unload")
end

return {
    on_load = on_load,
    on_frontend_loaded = on_frontend_loaded,
    on_unload = on_unload
}