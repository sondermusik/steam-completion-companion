local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local settings = require("settings")
local steamhunters = require("steamhunters")
local responses = require("responses")

local NS = "[SCC]"

local function log(message)
    logger:info(NS .. " " .. tostring(message))
    print(NS .. " " .. tostring(message))
end

local function to_number(value, fallback)
    local parsed = tonumber(value)

    if parsed == nil then
        return fallback or 0
    end

    return parsed
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

function shc_json_bridge(payload_json)
    log("shc_json_bridge called")
    log("payload_json type: " .. type(payload_json))
    log("payload_json value: " .. tostring(payload_json))

    if type(payload_json) ~= "string" then
        return responses.error_response(0, "unknown", "expected JSON string, got " .. type(payload_json), encode_json)
    end

    local payload, payload_err = decode_json(payload_json)

    if payload_err ~= nil then
        return responses.error_response(0, "unknown", payload_err, encode_json)
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
        return responses.no_app_response(page_kind, encode_json)
    end

    local app, app_err, app_from_cache = steamhunters.fetch_app(app_id, decode_json, log)

    if app_err ~= nil then
        log("SteamHunters app summary error: " .. tostring(app_err))
        return responses.error_response(app_id, page_kind, app_err, encode_json)
    end

    local achievements, achievements_err, achievements_from_cache =
        steamhunters.fetch_achievements(app_id, decode_json, log)

    if achievements_err ~= nil then
        log("SteamHunters achievements error: " .. tostring(achievements_err))
    end

    return responses.app_response(
        app,
        achievements,
        page_kind,
        app_from_cache,
        achievements_from_cache,
        achievements_err,
        encode_json,
        log
    )
end

function GetSettings()
    return encode_json({
        ok = true,
        settings = settings.load()
    })
end

function SaveSettings(params)
    local settings_json = params

    if type(params) == "table" then
        settings_json = params.settings_json
    end

    local decoded, err = decode_json(settings_json)

    if err ~= nil then
        log("SaveSettings decode failed: " .. tostring(err))

        return encode_json({
            ok = false,
            error = err,
            settings = settings.load()
        })
    end

    local saved = settings.save(decoded)

    if saved ~= true then
        log("SaveSettings write failed")
    end

    return encode_json({
        ok = saved,
        settings = settings.load()
    })
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
    on_unload = on_unload,
    GetSettings = GetSettings,
    SaveSettings = SaveSettings,
    shc_json_bridge = shc_json_bridge
}