local millennium = require("millennium")
local logger = require("logger")

local NS = "[SHC_PROBE]"

local function log(msg)
    logger:info(NS .. " " .. tostring(msg))
    print(NS .. " " .. tostring(msg))
end

local function escape_json_string(value)
    value = tostring(value or "")
    value = value:gsub("\\", "\\\\")
    value = value:gsub("\"", "\\\"")
    value = value:gsub("\n", "\\n")
    value = value:gsub("\r", "\\r")
    value = value:gsub("\t", "\\t")
    return value
end

local function extract_json_string(payload_json, key)
    if type(payload_json) ~= "string" then
        return ""
    end

    local pattern = "\"" .. key .. "\"%s*:%s*\"([^\"]*)\""
    local value = payload_json:match(pattern)

    if value == nil then
        return ""
    end

    return value
end

local function extract_json_number(payload_json, key)
    if type(payload_json) ~= "string" then
        return ""
    end

    local pattern = "\"" .. key .. "\"%s*:%s*(%d+)"
    local value = payload_json:match(pattern)

    if value == nil then
        return ""
    end

    return value
end

function shc_json_bridge(payload_json)
    log("shc_json_bridge called")
    log("payload_json type: " .. type(payload_json))
    log("payload_json value: " .. tostring(payload_json))

    if type(payload_json) ~= "string" then
        local err = "expected JSON string, got " .. type(payload_json)
        log("ERROR " .. err)

        return "{"
            .. "\"ok\":false,"
            .. "\"type\":\"error\","
            .. "\"error\":\"" .. escape_json_string(err) .. "\""
            .. "}"
    end

    local request_type = extract_json_string(payload_json, "type")
    local source = extract_json_string(payload_json, "source")
    local page_kind = extract_json_string(payload_json, "page_kind")
    local app_id = extract_json_number(payload_json, "app_id")
    local href = extract_json_string(payload_json, "href")

    log("request_type: " .. request_type)
    log("source: " .. source)
    log("page_kind: " .. page_kind)
    log("app_id: " .. app_id)
    log("href: " .. href)

    if app_id == "" then
        return "{"
            .. "\"ok\":true,"
            .. "\"type\":\"shc_page_info\","
            .. "\"has_app\":false,"
            .. "\"page_kind\":\"" .. escape_json_string(page_kind) .. "\","
            .. "\"title\":\"SHC detected page\","
            .. "\"summary\":\"No app id detected on this page yet.\","
            .. "\"restricted_count\":0,"
            .. "\"items\":[]"
            .. "}"
    end

    return "{"
        .. "\"ok\":true,"
        .. "\"type\":\"shc_page_info\","
        .. "\"has_app\":true,"
        .. "\"app_id\":" .. app_id .. ","
        .. "\"page_kind\":\"" .. escape_json_string(page_kind) .. "\","
        .. "\"title\":\"SteamHunters Companion\","
        .. "\"summary\":\"Probe data loaded for app " .. escape_json_string(app_id) .. ". Store and Library bridge works.\","
        .. "\"restricted_count\":2,"
        .. "\"items\":["
            .. "{"
                .. "\"label\":\"Restricted achievements\","
                .. "\"value\":\"2 fake entries\""
            .. "},"
            .. "{"
                .. "\"label\":\"Detected context\","
                .. "\"value\":\"" .. escape_json_string(page_kind) .. "\""
            .. "}"
        .. "]"
        .. "}"
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