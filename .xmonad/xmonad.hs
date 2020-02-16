import XMonad
import XMonad.Hooks.DynamicLog
import XMonad.Hooks.ManageDocks
import XMonad.Layout.Gaps
import XMonad.Layout.Spacing
import XMonad.Util.Run(spawnPipe)
import XMonad.Util.EZConfig
import System.IO

main = do
    xmproc <- spawnPipe "/usr/bin/xmobar ~/.xmonad/xmobarrc"
    xmonad $ defaultConfig
        { manageHook = manageDocks <+> manageHook defaultConfig
        , layoutHook = avoidStruts $ gaps [(U,10)] $ spacingRaw True (Border 0 3 3 3) True (Border 3 3 3 3) True $ layoutHook defaultConfig
        , terminal = "xterm"
        , borderWidth = 2
        , normalBorderColor = "#dddddd"
        , focusedBorderColor = "#5DADE2"
        }
        `additionalKeysP` myKeys

myKeys = [
      ("C-<Space>"      , spawn "gmrun"                 ) -- app launcher
    , ("M-r"            , spawn "xmonad --restart"      ) -- restart xmonad w/o recompiling
    ]

