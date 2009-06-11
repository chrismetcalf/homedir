package Recs::ExpressionHolder;

sub run_expr {
   my $__MY__this = shift;
   my $r = shift;
   my $__MY__expr = shift || $__MY__this->_get_expr();

   no strict;
   no warnings;

   my $value = eval $__MY__expr;

   die $@ if ( $@ );
   return $value;
}

sub _set_expr {
   my $this = shift;
   my $expr = shift;

   $this->{'expr'} = $expr;
}

sub _get_expr {
   my $this = shift;
   return $this->{'expr'};
}

1;
