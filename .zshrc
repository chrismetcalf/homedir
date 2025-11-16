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
# Exclude .zwc compiled files from being sourced
for file in $HOME/.zsh/rc/*; do
  [[ $file != *.zwc ]] && source $file
done

# Local, non-scm controlled configs. Loaded last to overload any other settings
if [ -f $HOME/.zshrc.local ]; then
    source $HOME/.zshrc.local
fi

# Compile zsh files for faster loading (runs at the end, asynchronously)
{
  _compile_zsh_file() {
    local file="$1"
    if [[ -f "$file" && (! -f "${file}.zwc" || "$file" -nt "${file}.zwc") ]]; then
      zcompile "$file" 2>/dev/null
    fi
  }

  # Compile main files
  _compile_zsh_file ~/.zshrc
  _compile_zsh_file ~/.oh-my-zsh/oh-my-zsh.sh

  # Compile all rc files
  for file in ~/.zsh/rc/*; do
    [[ -f "$file" && $file != *.zwc ]] && _compile_zsh_file "$file"
  done

  # Compile OS-specific files
  for file in ~/.zsh/os/*; do
    [[ -f "$file" && $file != *.zwc ]] && _compile_zsh_file "$file"
  done

  unfunction _compile_zsh_file
} &>/dev/null &
disown
