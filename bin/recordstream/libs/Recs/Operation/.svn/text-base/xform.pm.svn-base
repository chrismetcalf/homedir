package Recs::Operation::xform;

use strict;

use base qw(Recs::Operation Recs::ExpressionHolder);

sub init {
   my $this = shift;
   my $args = shift;

   my %options = (
      "use-return|ret" => sub { $this->_set_use_return(1); },
   );

   $this->parse_options($args, \%options);
   if(!@{$this->_get_extra_args()}) {
      die "Missing expression\n";
   }
   $this->_set_expr(shift @{$this->_get_extra_args()});
}

sub accept_record {
   my $this   = shift;
   my $record = shift;

   my $return;
   eval {
      $return = $this->run_expr($record);
   };

   if ( $@ ) {
      warn "Code threw: $@";
   }

   if(!$this->get_use_return()) {
      $return = $record;
   }
   if(ref($return) ne "ARRAY")
   {
      $return = [$return];
   }
   for my $output (@$return)
   {
      if(ref($output) eq "Recs::Record")
      {
         $this->push_record($output);
      }
      elsif(ref($output) eq "HASH")
      {
         $this->push_record(Recs::Record->new($output));
      }
      elsif(ref($output) eq "")
      {
         warn "Found scalar in output";
      }
      else
      {
         warn "Found strange ref in output, ref is " . ref($output);
      }
   }
}

sub _set_use_return {
   my $this  = shift;
   my $value = shift;

   $this->{'USE_RETURN'} = $value;
}

sub get_use_return {
   my $this = shift;
   return $this->{'USE_RETURN'} || 0;
}

sub usage {
   return <<USAGE;
Usage: recs-xform <args> <expr> [<files>]
   <expr> is evaluated as perl on each record of input (or records from
   <files>) with \$r set to a Recs::Record object and \$line set to the current
   line number (starting at 1).  All records are printed back out (changed as
   they may be).  Any changes the expression makes to \$r are not guaranteed to
   take effect (changes to its contents are what is expected).

Arguments:
   --use-return|--ret   Use the return from the expression instead of \$r.
                        Hashrefs are constructed into records, a first level of
                        arrayref will be expanded (allowing zero or multiple
                        output records per input record).
   --help               Bail and output this help screen.

Examples:
   Add line number to records
      recs-xform '\$r->{line} = \$line'
   Rename field a to b
      recs-xform '\$r->rename("a", "n")'
   Delete field a
      recs-xform '\$r->delete("a")'
   Remove fields which are not "a", "b", or "c"
      recs-xform '\$r->prune("a", "b", "c")'
   Double records
      recs-xform --ret '[\$r, \$r]'
   Split the records on field a
      recs-xform --ret '[map { {%\$r, "a" => \$_} } split(/,/, delete(\$r->{"a"}))]'
USAGE
}

1;
