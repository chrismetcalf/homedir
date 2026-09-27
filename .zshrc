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

# local::lib. Written by its own bootstrap on the Linux box, which hardcoded
# that box's home directory -- and this file is shared with a Mac, where
# /home/krezel is not merely absent but ACTIVELY EXPENSIVE: /etc/auto_master
# maps /home to auto_home, so every stat under it goes through the automounter.
# Measured here, 29ms for a path that does not exist, against 0.9ms for the same
# miss under /opt. Sitting first in PATH, that was paid on EVERY command
# resolution on the machine -- ~72ms of the ~90ms it took to start any
# `#!/usr/bin/env bash` script, prefix + u included. Exactly the hazard CLAUDE.md
# records for NFS mounts in PATH, arriving from a direction nothing was watching:
# a hardcoded Linux path in a file this repo checks in.
#
# $HOME rather than the literal: on the Linux host $HOME *is* /home/krezel, so
# this is byte-identical there. Guarded on the directory existing so a host
# without a local::lib pays one stat at login rather than one per command.
if [ -d "$HOME/perl5" ]; then
  PATH="$HOME/perl5/bin${PATH:+:${PATH}}"; export PATH;
  PERL5LIB="$HOME/perl5/lib/perl5${PERL5LIB:+:${PERL5LIB}}"; export PERL5LIB;
  PERL_LOCAL_LIB_ROOT="$HOME/perl5${PERL_LOCAL_LIB_ROOT:+:${PERL_LOCAL_LIB_ROOT}}"; export PERL_LOCAL_LIB_ROOT;
  PERL_MB_OPT="--install_base \"$HOME/perl5\""; export PERL_MB_OPT;
  PERL_MM_OPT="INSTALL_BASE=$HOME/perl5"; export PERL_MM_OPT;
fi

test -e "$HOME/.shellfishrc" && source "$HOME/.shellfishrc"
