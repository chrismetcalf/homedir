package Recs::Aggregator::MapReduce;

use strict;
use lib;

sub new
{
   my $class = shift;

   my $this = { };
   bless $this, $class;

   return $this;
}

sub initial
{
   return undef;
}

sub combine
{
   my ($this, $cookie, $record) = @_;

   return defined($cookie) ? $this->reduce($cookie, $this->map($record)) : $this->map($record);
}

sub squish
{
   my ($this, $cookie) = @_;

   return $cookie;
}

sub map
{
   die "MapReduce subclass did not implement map.\n";
}

sub reduce
{
   die "MapReduce subclass did not implement reduce.\n";
}

1;
