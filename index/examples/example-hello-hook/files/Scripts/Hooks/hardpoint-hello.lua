-- Hardpoint example mod: proves a Saved Games install works.
-- On mission load it writes one line to Saved Games\DCS\Logs\dcs.log.
local hello = {}
function hello.onMissionLoadEnd()
    log.write("HARDPOINT", log.INFO, "Hardpoint example hook is installed and running")
end
DCS.setUserCallbacks(hello)
