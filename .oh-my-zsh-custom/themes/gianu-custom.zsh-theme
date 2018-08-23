autoload -U colors
colors

setopt prompt_subst

colnames=(
	black
	red
	green
	yellow
	blue
	magenta
	cyan
	white
	default
)

# Create color variables for foreground and background colors
for color in $colnames; do
	eval f$color='%{${fg[$color]}%}'
	eval b$color='%{${bg[$color]}%}'
done

# Hash the hostname and return a fixed "random" color
function _hostname_color() {
	local chash=0
	foreach letter ( ${(ws::)HOST[(ws:.:)1]} )
		(( chash += #letter ))
	end
	local crand=$(( $chash % $#colnames ))
	local crandname=$colnames[$crand]
	echo "%{${fg[$crandname]}%}"
}
hostname_color=$(_hostname_color)

PROMPT='[%{$fg_bold[white]%}%n%{$reset_color%}@%{$hostname_color%}%m%{$reset_color%} %{$fg[cyan]%}%c%{$reset_color%} $(git_prompt_info)%{$reset_color%}]$ '

ZSH_THEME_GIT_PROMPT_PREFIX="(%{$fg_bold[green]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX=")"
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg[green]%} %{$fg[yellow]%}✗%{$reset_color%}"
ZSH_THEME_GIT_PROMPT_CLEAN="%{$reset_color%}"
