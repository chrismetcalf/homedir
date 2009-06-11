package Recs::Operation::totable;

use strict;
use warnings;

use base qw(Recs::Accumulator Recs::Operation Recs::ScreenPrinter);

sub init {
   my $this = shift;
   my $args = shift;

   my $no_header   = 0;
   my $delimiter   = "\t";
   my $spreadsheet = 0;
   my @fields;

   my $spec = {
      "no-header|n"   => \$no_header,
      "field|f=s"     => sub { push @fields, split(/,/, $_[1]); },
      "delim|d=s"     => \$delimiter,
      "spreadsheet|s" => \$spreadsheet,
   };

   $this->parse_options($args, $spec);

   $this->{'NO_HEADER'}   = $no_header;
   $this->{'FIELDS'}      = \@fields;
   $this->{'DELIMITER'}   = $delimiter;
   $this->{'SPREADSHEET'} = $spreadsheet;
}

sub stream_done {
   my $this = shift;

   my $records = $this->get_records();
   my $fields  = $this->{'FIELDS'};

   my %fields_hash;
   foreach(@$fields) {
      $fields_hash{$_} = "";
   }

   my %widths;

   foreach my $record (@$records) {
      foreach my $field (keys %$record) {
         if(%fields_hash && !exists($fields_hash{$field})) {
            next;
         }

         if(!exists($widths{$field})) {
            $widths{$field} = 0;
         }

         $widths{$field} = max($widths{$field}, length($record->{$field}));
      }
   }

   my $no_header = $this->{'NO_HEADER'};
   if(!$no_header) {
      foreach my $field (keys(%widths)) {
         $widths{$field} = max($widths{$field}, length($field));
      }
   }

   if(!@$fields) {
      $fields = [ sort(keys(%widths)) ];
   }

   if(!$no_header) {
      $this->print_value(
         $this->format_row(
            $fields, 
            \%widths, 
            sub { return $_[0]; }, 
            ""
         ) . "\n"
      );

      if ( ! $this->{'SPREADSHEET'} ) {
         $this->print_value(
            $this->format_row(
               $fields, 
               \%widths, 
               sub { return ("-" x $widths{$_[0]}); }, 
               ""
            ) . "\n"
         );
      }
   }

   foreach my $record (@$records) {
      $this->print_value(
         $this->format_row(
            $fields, 
            \%widths, 
            sub { return (exists($_[1]->{$_[0]}) ? $_[1]->{$_[0]} : ""); }, 
            $record
         ) . "\n"
      );
   }
}

sub format_row {
   my ($this, $fieldsr, $widthsr, $format_fieldr, $thunk) = @_;

   my $first = 1;
   my $row_string = "";

   foreach my $field (@$fieldsr) {
      my $field_string = $format_fieldr->($field, $thunk);

      if ( (! $this->{'SPREADSHEET'}) &&
           (length($field_string) < $widthsr->{$field})) {

         $field_string .= " " x ($widthsr->{$field} - length($field_string));
      }

      if($first) {
         $first = 0;
      }
      else {
         $row_string .= ($this->{'SPREADSHEET'}) ? $this->{'DELIMITER'} : "   ";
      }

      $row_string .= $field_string;
   }

   return $row_string;
}

# Max helper function
sub max {
   my $max = shift;

   foreach my $value (@_) {
      if($value > $max) {
         $max = $value;
      }
   }

   return $max;
}

sub usage {
   return <<USAGE;
Usage: recs-totable <args> [<files>]
   Pretty prints a table of records to the screen.  Will read in the entire
   record stream to determine column size, and number of columns
   
   --no-header|n           Do not print column headers
   --field|f <field name>  May be comma separated, may be specified multiple
                           times.  Specifies the fields to put in the table.
   --spreadsheet           Print out in a format suitable for excel.
                           1. Does not print line of -s after header
                           2. Separates by single character rather than series 
                               of spaces
   --delimiter <string>    Only useful with --spreadsheet, delimit with 
                           <string> rather than the default of a tab
   --help                  Bail and print this usage

Examples:
   Display a table
      recs-totable
   Display only one field
      recs-totable -f foo
   Display two fields without a header
      recs-totable -f foo -f bar --no-header
USAGE
}

1;
