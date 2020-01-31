# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block, everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

######################### zsh options ################################
setopt ALWAYS_TO_END           # Push that cursor on completions.
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

# Local, non-scm controlled configs. Loaded last to overload any other settings
if [ -f $HOME/.zshrc.local ]; then
    source $HOME/.zshrc.local
fi

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
