######################### zsh options ################################
setopt ALWAYS_TO_END	       # Push that cursor on completions.
setopt AUTO_NAME_DIRS          # change directories  to variable names
setopt AUTO_PUSHD              # push directories on every cd
setopt NO_BEEP                 # self explanatory

############## Imports

# OS-specific configurations
if [ -f $HOME/.zsh/os/$VENDOR -a ! -z $VENDOR ]; then
    source $HOME/.zsh/os/$VENDOR
fi

# Everything not zsh-specific is broken out into imports now
for file in $HOME/.zsh/rc/*; do
  source $file
done

# Host-specific configurations
if [ -f $HOME/.zsh/host/`hostname -s` ]; then
    source $HOME/.zsh/host/`hostname -s`
fi

# Local, non-scm controlled configs. Loaded last to overload any other settings
if [ -f $HOME/.zshrc.local ]; then
    source $HOME/.zshrc.local
fi

# added by travis gem
[ -f /Users/metcalf/.travis/travis.sh ] && source /Users/metcalf/.travis/travis.sh

[ -f $HOME/.fzf.zsh ] && source $HOME/.fzf.zsh
