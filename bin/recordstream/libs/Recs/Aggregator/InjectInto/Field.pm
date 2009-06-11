package Recs::Aggregator::InjectInto::Field;

use strict;
use lib;

use Recs::Aggregator::InjectInto;
use base qw(Recs::Aggregator::InjectInto);

sub new
{
   my $class = shift;
   my $field = shift;

   my $this = {
      'field' => $field,
   };

   bless $this, $class;

   return $this;
}

sub initial
{
   return undef;
}

sub combine
{
   my $this   = shift;
   my $cookie = shift;
   my $record = shift;

   return $this->combine_field($cookie, $record->get($this->{'field'}));
}

sub squish
{
   my ($this, $cookie) = @_;

   return $cookie;
}

sub argct
{
   return 1;
}


1;
