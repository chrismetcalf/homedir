# User defined aliases
alias ls='ls --color'
alias vi='vim'

if [ "x$AUTO_TITLE_SCREENS" '!=' "xNO" ]
then

  # if you are at a zsh prompt, make your screen title your current directory
  precmd ()
  {
    if [[ "$TERM" == "screen" ]]; then
      local TIPDIR=`basename $PWD`
      echo -ne "\ek$TIPDIR\e\\"
    fi
  }

  # if you are running a command, make your screen title the command you're
  # running
  preexec ()
  {
    if [[ "$TERM" == "screen" ]]; then
      local CMD=${1/% */}  # kill all text after and including the first space
      echo -ne "\ek$CMD\e\\"
    fi
  }

fi

# Number of directories in your pushd/popd stack
DIRSTACKSIZE=20   

# Default apps
export EDITOR="vim"
export VISUAL="$EDITOR"
export PAGER="less"

# Options for less 
export LESS='-i'

# Colors for ls
export LS_COLORS='no=00:fi=00:di=01;34:ln=01;36:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arj=01;31:*.taz=01;31:*.lzh=01;31:*.zip=01;31:*.z=01;31:*.Z=01;31:*.gz=01;31:*.bz2=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.jpg=01;35:*.jpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.mpg=01;35:*.mpeg=01;35:*.avi=01;35:*.fli=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.ogg=01;35:*.mp3=01;35:*.wav=01;35:*.tex=01;33:*.sxw=01;33:*.sxc=01;33:*.lyx=01;33:*.pdf=0;35:*.ps=00;36:*.asm=1;33:*.S=0;33:*.s=0;33:*.h=0;31:*.c=0;35:*.cxx=0;35:*.cc=0;35:*.C=0;35:*.o=1;30:*.am=1;33:*.py=0;34:'

# Turn on grep coloring
export GREP_COLOR='1;35'

# Vim style line editing
#bindkey -v
bindkey "" history-incremental-search-backward
bindkey '' end-of-line
bindkey '' beginning-of-line

#AWESOME...
#pushes current command on command stack and gives blank line, after that line
#runs command stack is popped
bindkey "^t" push-line-or-edit

# VI editing mode is a pain to use if you have to wait for <ESC> to register.
# This times out multi-char key combos as fast as possible. (1/100th of a
# second.)
KEYTIMEOUT=1

######################### zsh options ################################
setopt ALWAYS_TO_END	       # Push that cursor on completions.
setopt AUTO_NAME_DIRS          # change directories  to variable names
setopt AUTO_PUSHD              # push directories on every cd
setopt NO_BEEP                 # self explanatory

######################### history options ############################
setopt EXTENDED_HISTORY        # store time in history
setopt HIST_EXPIRE_DUPS_FIRST  # unique events are more usefull to me
setopt HIST_VERIFY	       # Make those history commands nice
setopt INC_APPEND_HISTORY      # immediatly insert history into history file
HISTSIZE=16000                 # spots for duplicates/uniques
SAVEHIST=15000                 # unique events guarenteed
HISTFILE=~/.history

# The following lines were added by compinstall
_force_rehash() {
    (( CURRENT == 1 )) && rehash
      return 1 # Because we didn't really complete anything
}

zstyle ':completion:*' completer _expand _force_rehash _complete _approximate
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' list-prompt '%SAt %p: Hit TAB for more, or the character to insert%s'
zstyle ':completion:*' matcher-list '' 'm:{a-z}={A-Z}' 'r:|[._-]=** r:|=**' 'l:|=* r:|=*'
zstyle ':completion:*' menu select=long
zstyle ':completion:*' select-prompt '%SScrolling active: current selection at %p%s'
zstyle ':completion:*' use-compctl true

autoload -U compinit
compinit -C
# End of lines added by compinstall

# rscreen should get ssh's options
compdef _ssh rscreen

# A less annoying prompt
autoload colors
colors
fg_green=$'%{\e[0;32m%}'
fg_blue=$'%{\e[0;34m%}'
fg_cyan=$'%{\e[0;36m%}'
fg_red=$'%{\e[0;31m%}'
fg_brown=$'%{\e[0;33m%}'
fg_purple=$'%{\e[0;35m%}'

fg_light_gray=$'%{\e[0;37m%}'
fg_dark_gray=$'%{\e[1;30m%}'
fg_light_blue=$'%{\e[1;34m%}'
fg_light_green=$'%{\e[1;32m%}'
fg_light_cyan=$'%{\e[1;36m%}' fg_light_red=$'%{\e[1;31m%}'
fg_light_purple=$'%{\e[1;35m%}'
fg_no_colour=$'%{\e[0m%}'

fg_white=$'%{\e[1;37m%}'
fg_black=$'%{\e[0;30m%}'

export PS1="${fg_green}%n${fg_no_colour}@${fg_cyan}%m ${fg_red}%30<...<%~%<< ${fg_no_colour}%#> "
unset RPROMPT
setopt AUTOLIST

export PATH=$HOME/bin:$PATH

# For recordstream
export PERLLIB=$HOME/bin/record-stream/libs:$PERLLIB

# Local, non-scm controlled configs
if [ -f ~/.zshrc.local ]; then
    source ~/.zshrc.local
fi

# OS-specific configurations
if [ -f ~/.zshrc.$VENDOR -a ! -z $VENDOR ]; then
    source ~/.zshrc.$VENDOR
fi

# Host-specific configurations
if [ -f ~/.zshrc.`hostname -s` ]; then
    source ~/.zshrc.`hostname -s`
fi
