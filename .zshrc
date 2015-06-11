######################### zsh options ################################
setopt ALWAYS_TO_END	       # Push that cursor on completions.
setopt AUTO_NAME_DIRS          # change directories  to variable names
setopt AUTO_PUSHD              # push directories on every cd
setopt NO_BEEP                 # self explanatory

############## Imports

# OS-specific configurations
if [ -f ~/.zsh/os/$VENDOR -a ! -z $VENDOR ]; then
    source ~/.zsh/os/$VENDOR
fi

# Everything not zsh-specific is broken out into imports now
for file in $HOME/.zsh/rc/*; do
  source $file
done

# Host-specific configurations
if [ -f ~/.zsh/host/`hostname -s` ]; then
    source ~/.zsh/host/`hostname -s`
fi

# Local, non-scm controlled configs. Loaded last to overload any other settings
if [ -f ~/.zshrc.local ]; then
    source ~/.zshrc.local
fi
