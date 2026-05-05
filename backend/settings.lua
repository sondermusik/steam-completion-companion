local json = require("json")

local SETTINGS_PATH = "settings.json"

local DEFAULT_SETTINGS = {
    showInLibrary = true,
    showOnStorePages = true,
    visibleContent = {
        medianCompletion = true,
        playersPerfected = true,
        perfectedByStarters = true,
        paidDlc = true,
        restricted = true,
        broken = true,
        conditional = true,
        unobtainable = true,
        steamHuntersLink = true
    }
}

local function read_file(path)
    local file = io.open(path, "r")
    if file == nil then return nil end

    local content = file:read("*a")
    file:close()
    return content
end

local function write_file(path, content)
    local file = io.open(path, "w")
    if file == nil then return false end

    file:write(content)
    file:close()
    return true
end

local function merge_defaults(settings, defaults)
    if type(settings) ~= "table" then
        settings = {}
    end

    defaults = defaults or DEFAULT_SETTINGS

    for key, value in pairs(defaults) do
        if type(value) == "table" then
            settings[key] = merge_defaults(settings[key], value)
        elseif settings[key] == nil then
            settings[key] = value
        end
    end

    return settings
end

local function load_settings()
    local content = read_file(SETTINGS_PATH)

    if content == nil or content == "" then
        return merge_defaults({})
    end

    local ok, decoded = pcall(json.decode, content)

    if not ok or type(decoded) ~= "table" then
        return merge_defaults({})
    end

    return merge_defaults(decoded)
end

local function save_settings(settings)
    local merged = merge_defaults(settings)

    local ok, encoded = pcall(json.encode, merged)
    if not ok then
        return false
    end

    return write_file(SETTINGS_PATH, encoded)
end

return {
    defaults = DEFAULT_SETTINGS,
    load = load_settings,
    save = save_settings,
    merge_defaults = merge_defaults
}