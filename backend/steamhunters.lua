local http = require("http")

local M = {}

local CACHE_TTL_SECONDS = 60 * 30

local app_cache = {}
local achievements_cache = {}

local DEFAULT_HEADERS = {
    ["Accept"] = "application/json",
    ["X-Requested-With"] = "Steam",
    ["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36"
}

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

local function request_json(url, decode_json, log)
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

function M.fetch_app(app_id, decode_json, log)
    local cached = get_cache(app_cache, app_id)

    if cached ~= nil then
        return cached, nil, true
    end

    local url = "https://steamhunters.com/api/apps/" .. tostring(app_id)
    local data, err = request_json(url, decode_json, log)

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

function M.fetch_achievements(app_id, decode_json, log)
    local cached = get_cache(achievements_cache, app_id)

    if cached ~= nil then
        return cached, nil, true
    end

    local url = "https://steamhunters.com/api/apps/" .. tostring(app_id) .. "/achievements"
    local data, err = request_json(url, decode_json, log)

    if err ~= nil then
        return nil, err, false
    end

    local counts = count_achievement_obtainability(data)

    set_cache(achievements_cache, app_id, counts)

    return counts, nil, false
end

return M