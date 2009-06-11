package Recs::Aggregator::DistinctCount;

use strict;
use lib;

use Recs::Aggregator::InjectInto::Field;
use base qw(Recs::Aggregator::InjectInto::Field);

sub new
{
   my $class = shift;
   return $class->SUPER::new(@_);
}

sub initial {
   return {};
}

sub combine_field
{
   my $this   = shift;
   my $cookie = shift;
   my $value  = shift;

   $cookie->{$value} = 1;
   return $cookie;
}

sub squish {
   my $this   = shift;
   my $cookie = shift;

   return keys(%$cookie);
}

sub short_usage
{
   return "Count of unique values for a field";
}

sub long_usage
{
   print <<USAGE;
Usage: dct,<field>
   Finds the number of unique values for a field and returns it.  Will load all
   values into memory.
USAGE

   exit 1
}

Recs::Aggregator::register_aggregator('dcount', __PACKAGE__);
Recs::Aggregator::register_aggregator('dct', __PACKAGE__);
Recs::Aggregator::register_aggregator('distinctcount', __PACKAGE__);
Recs::Aggregator::register_aggregator('distinctct', __PACKAGE__);

1;
