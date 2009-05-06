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

############## Imports

# Everything not zsh-specific is broken out into imports now
for file in $HOME/.zsh/rc/*; do
  source $file
done

# OS-specific configurations
if [ -f ~/.zsh/os/$VENDOR -a ! -z $VENDOR ]; then
    source ~/.zsh/os/$VENDOR
fi

# Host-specific configurations
if [ -f ~/.zsh/host/`hostname -s` ]; then
    source ~/.zsh/host/`hostname -s`
fi

# Local, non-scm controlled configs. Loaded last to overload any other settings
if [ -f ~/.zshrc.local ]; then
    source ~/.zshrc.local
fi
