package OperationHelper;

use strict;
use warnings;

use Test::More;
use Recs::InputStream;

sub new {
   my $class = shift;
   my %args  = @_;

   my $this = {
      INPUT     => create_stream($args{'input'}),
      OUTPUT    => create_stream($args{'output'}),
      OPERATION => $args{'operation'},
   };

   bless $this, $class;

   return $this;
}

sub create_stream {
   my $input = shift;

   return undef unless ( $input );

   if ( UNIVERSAL::isa($input, 'Recs::InputStream') ) {
      return $input;
   }

   if ( (not ($input =~ m/\n/m))  && -e $input ) {
      return Recs::InputStream->new(FILE => $input);
   }

   return Recs::InputStream->new(STRING => $input);
}

sub matches {
   my $this = shift;

   my $op     = $this->{'OPERATION'};
   my $input  = $this->{'INPUT'};
   my $keeper = Keeper->new();

   $op->set_input_stream($input);
   $op->_set_next_operation($keeper);
   $op->run_operation();
   $op->finish();

   my $output  = $this->{'OUTPUT'};
   my $results = $keeper->get_records();
   my $i = 0;

   my @output_records;
   if ( $output ) {
      while ( my $rec = $output->get_record() ) {
         push @output_records, $rec;
      }
   }

   is_deeply($results, \@output_records, "Records match");

   ok($keeper->has_called_finish(), "Has called finish");
}

sub do_match {
   my $class          = shift;
   my $operation_name = shift;
   my $args           = shift;
   my $input          = shift;
   my $output         = shift;

   my $operation_class = "Recs::Operation::$operation_name";
   my $op = $operation_class->new($args);

   ok($op, "Operation initialization");

   my $helper = $class->new(
      operation => $op,
      input     => $input,
      output    => $output,
   );

   $helper->matches();

   return $helper;
}

sub test_output {
   my $class          = shift;
   my $operation_name = shift;
   my $args           = shift;
   my $input          = shift;
   my $output         = shift;
  
   my $operation_class = "Recs::Operation::$operation_name";
   my $op = $operation_class->new($args);

   ok($op, "Object initialization");

   my @collected_output;
   $op->set_printer(sub { push @collected_output, shift() });

   my $helper = OperationHelper->new(
      operation => $op,
      input     => $input,
      output    => '',
   );

   $helper->matches();

   is(join ('', @collected_output), $output, "Output matches excepted");
}


package Keeper;

use base qw(Recs::Operation);

sub new {
   my $class = shift;
   my $this = { RECORDS => [] };
   bless $this, $class;
   return $this;
}

sub accept_record {
   my $this = shift;
   my $record = shift;
   push @{$this->{'RECORDS'}}, $record;
}

sub get_records {
   my $this = shift;
   return $this->{'RECORDS'};
}

sub has_called_finish {
   my $this = shift;
   return $this->{'CALLED_FINISH'};
}

sub finish {
  my $this = shift;
  $this->{'CALLED_FINISH'} = 1;
}

1;
