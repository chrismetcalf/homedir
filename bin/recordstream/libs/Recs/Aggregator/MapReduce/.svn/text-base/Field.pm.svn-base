package Recs::Aggregator::MapReduce::Field;

use strict;
use lib;

use Recs::Aggregator::MapReduce;

use base 'Recs::Aggregator::MapReduce';

sub new
{
   my $class = shift;
   my ($field) = @_;

   my $this =
   {
      'field' => $field,
   };
   bless $this, $class;

   return $this;
}

sub map
{
   my ($this, $record) = @_;

   return $this->map_field($record->get($this->{'field'}));
}

sub map_field
{
   my ($this, $value) = @_;

   return $value;
}

sub argct
{
   return 1;
}

1;
