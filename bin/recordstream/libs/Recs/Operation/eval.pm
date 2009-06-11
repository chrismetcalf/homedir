package Recs::Operation::eval;

use strict;
use warnings;

use base qw(Recs::Operation Recs::ExpressionHolder Recs::ScreenPrinter);

sub init {
   my $this = shift;
   my $args = shift;

   $this->parse_options($args);
   if(!@{$this->_get_extra_args()}) {
      die "Missing expression\n";
   }
   $this->_set_expr(shift @{$this->_get_extra_args()});
}

sub accept_record {
   my $this   = shift;
   my $record = shift;

   my $value;
   eval {
      $value = $this->run_expr($record);
   };

   if ( $@ ) {
      warn "Code threw: $@";
   }
   else {
      $this->print_value($value . "\n");
   }
}

sub usage {
   return <<USAGE;
Usage: recs-eval <args> <expr> [<files>]
   <expr> is evaluated as perl on each record of input (or records from
   <files>) with \$r set to a Recs::Record object and \$line set to the current
   line number (starting at 1).  The result of each evaluation is printed on a
   line by itself (this is not a recs stream).  See Recs::Record for help on
   what the \$r object can do.

Arguments:
   --help   Bail and output this help screen.

Examples:
   Print the host field from each record.
      recs-eval '\$r->{host}'
   Prepare to gnuplot field y against field x.
      recs-eval '\$r->{x} . " " . \$r->{y}'
   Set up a script (this would be presumably piped to sh)
      recs-eval '"./myscript --value \$r->{foo}"'
USAGE
}

1;
